import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { netOf, peso, splitEqual, toCents } from '../src/utils/money.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEMO_PASSWORD = 'SplitMateDemo123!'
const GROUP_NAME = 'Boarding House'

const MEMBERS = [
  { key: 'mia', name: 'Mia', email: 'mia.demo@splitmate.test' },
  { key: 'joy', name: 'Joy', email: 'joy.demo@splitmate.test' },
  { key: 'karl', name: 'Karl', email: 'karl.demo@splitmate.test' },
  { key: 'ben', name: 'Ben', email: 'ben.demo@splitmate.test' },
  { key: 'lea', name: 'Lea', email: 'lea.demo@splitmate.test' },
]

const ALL_KEYS = ['mia', 'joy', 'karl', 'ben', 'lea']

const EXPENSES = [
  { title: 'Renta', amount: 6000, paidBy: 'lea', participants: ALL_KEYS, category: 'Accommodation' },
  { title: 'Kuryente', amount: 1800, paidBy: 'mia', participants: ALL_KEYS, category: 'Utilities' },
  { title: 'Tubig', amount: 400, paidBy: 'joy', participants: ALL_KEYS, category: 'Utilities' },
  { title: 'Internet', amount: 1000, paidBy: 'mia', participants: ALL_KEYS, category: 'Utilities' },
  { title: 'Grocery', amount: 2500, paidBy: 'karl', participants: ['mia', 'joy', 'karl', 'lea'], category: 'Groceries' },
]

const EXPECTED_NET = { mia: 33500, joy: -206500, karl: 3500, lea: 353500, ben: -184000 }
const EXPECTED_PAYMENTS = [
  { from: 'joy', to: 'lea', amount: 206500 },
  { from: 'ben', to: 'lea', amount: 147000 },
  { from: 'ben', to: 'mia', amount: 33500 },
  { from: 'ben', to: 'karl', amount: 3500 },
]

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const path = resolve(ROOT, file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      let value = match[2].trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!(match[1] in process.env)) process.env[match[1]] = value
    }
  }
}

function fail(message) {
  console.error(`\nERROR: ${message}`)
  process.exit(1)
}

function confirmationHelp() {
  console.error('\nDemo signups need email confirmation turned off, otherwise the script cannot sign in.')
  console.error('In Supabase: Authentication > Providers > Email, turn off "Confirm email", then re-run:')
  console.error('  npm run seed:boardinghouse\n')
}

async function ensureUser(supabase, member) {
  const signIn = await supabase.auth.signInWithPassword({ email: member.email, password: DEMO_PASSWORD })
  if (!signIn.error) return signIn.data.user

  const { data, error } = await supabase.auth.signUp({
    email: member.email,
    password: DEMO_PASSWORD,
    options: { data: { full_name: member.name } },
  })
  if (error && !/already registered/i.test(error.message)) {
    fail(`Could not sign up ${member.email}: ${error.message}`)
  }

  const retry = await supabase.auth.signInWithPassword({ email: member.email, password: DEMO_PASSWORD })
  if (retry.error) {
    if (!data?.session) confirmationHelp()
    fail(`Could not sign in ${member.email}: ${retry.error.message}`)
  }
  return retry.data.user
}

// Mirrors the "Who pays whom" greedy simplification in src/pages/GroupDetail.jsx.
function whoPaysWhom(balances) {
  const debtors = []
  const creditors = []
  for (const b of balances) {
    const n = Math.round(netOf(b) * 100)
    if (n < 0) debtors.push({ user_id: b.user_id, amount: -n })
    else if (n > 0) creditors.push({ user_id: b.user_id, amount: n })
  }
  const payments = []
  while (debtors.length && creditors.length) {
    debtors.sort((a, b) => b.amount - a.amount)
    creditors.sort((a, b) => b.amount - a.amount)
    const d = debtors[0]
    const c = creditors[0]
    const amount = Math.min(d.amount, c.amount)
    if (amount <= 0) break
    payments.push({ from: d.user_id, to: c.user_id, amount })
    d.amount -= amount
    c.amount -= amount
    if (d.amount === 0) debtors.shift()
    if (c.amount === 0) creditors.shift()
  }
  return payments
}

function check(label, actual, expected, format) {
  const ok = actual === expected
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (actual ${format(actual)}, expected ${format(expected)})`}`)
  return ok
}

async function main() {
  loadEnv()
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) fail('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Fill in .env first.')

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  console.log('Ensuring demo users exist...')
  const ids = {}
  for (const member of MEMBERS) {
    const user = await ensureUser(supabase, member)
    ids[member.key] = user.id
    console.log(`  ${member.name} <${member.email}> ${user.id}`)
  }

  const miaSignIn = await supabase.auth.signInWithPassword({ email: MEMBERS[0].email, password: DEMO_PASSWORD })
  if (miaSignIn.error) fail(`Could not sign in as Mia: ${miaSignIn.error.message}`)

  const { data: existing, error: existingError } = await supabase
    .from('groups')
    .select('id')
    .eq('name', GROUP_NAME)
    .eq('created_by', ids.mia)
    .maybeSingle()
  if (existingError) fail(`Could not check for an existing group: ${existingError.message}`)
  if (existing) {
    console.log(`\n"${GROUP_NAME}" already exists for ${MEMBERS[0].name} (${existing.id}). Nothing was added.`)
    return
  }

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({ name: GROUP_NAME, description: 'Demo boarding house for testing balances.', created_by: ids.mia })
    .select('id')
    .single()
  if (groupError) fail(`Could not create "${GROUP_NAME}": ${groupError.message}`)
  console.log(`\nCreated group "${GROUP_NAME}" (${group.id}).`)

  for (const member of MEMBERS.slice(1)) {
    const { error } = await supabase.rpc('add_member_by_email', { gid: group.id, member_email: member.email })
    if (error) fail(`Could not add ${member.name}: ${error.message}`)
    console.log(`  Added ${member.name}`)
  }

  const today = new Date().toISOString().slice(0, 10)
  console.log('\nAdding expenses...')
  for (const expense of EXPENSES) {
    const participantIds = expense.participants.map((k) => ids[k])
    const splits = splitEqual(toCents(expense.amount), participantIds)
    const { error } = await supabase.rpc('create_expense', {
      p_group: group.id,
      p_title: expense.title,
      p_description: '',
      p_amount: expense.amount,
      p_category: expense.category,
      p_paid_by: ids[expense.paidBy],
      p_split_type: 'equal',
      p_date: today,
      p_splits: splits,
    })
    if (error) fail(`Could not add "${expense.title}": ${error.message}`)
    console.log(`  ${expense.title}: ${peso(expense.amount)} paid by ${MEMBERS.find((m) => m.key === expense.paidBy).name}`)
  }

  const { data: balances, error: balancesError } = await supabase.rpc('group_balances', { gid: group.id })
  if (balancesError) fail(`Could not load balances: ${balancesError.message}`)

  const nameOf = (uid) => MEMBERS.find((m) => ids[m.key] === uid)?.name || uid
  const byId = Object.fromEntries(MEMBERS.map((m) => [ids[m.key], m.key]))

  console.log('\nBalances (net = paid - shares + settled paid - settled received)')
  const rows = balances.map((b) => {
    const net = Math.round(netOf(b) * 100)
    const expected = EXPECTED_NET[byId[b.user_id]]
    return { Person: nameOf(b.user_id), Net: peso(net / 100), Expected: peso(expected / 100), Check: net === expected ? 'PASS' : 'FAIL' }
  })
  console.table(rows)

  let allPassed = true
  for (const member of MEMBERS) {
    const row = balances.find((b) => b.user_id === ids[member.key])
    const actual = row ? Math.round(netOf(row) * 100) : 0
    if (!check(`${member.name} net`, actual, EXPECTED_NET[member.key], (v) => peso(v / 100))) allPassed = false
  }

  const payments = whoPaysWhom(balances)
  console.log('\nWho pays whom')
  if (!payments.length) {
    console.log('  Everyone is settled up.')
  } else {
    for (const p of payments) console.log(`  ${nameOf(p.from)} pays ${nameOf(p.to)} ${peso(p.amount / 100)}`)
  }

  console.log('\nSimplified payment checks')
  const paymentsMatch = payments.length === EXPECTED_PAYMENTS.length && EXPECTED_PAYMENTS.every((expected, i) => {
    const actual = payments[i]
    return actual && expected.from === byId[actual.from] && expected.to === byId[actual.to] && expected.amount === actual.amount
  })
  if (!check('Simplified payments match', paymentsMatch, true, String)) allPassed = false
  if (!paymentsMatch) {
    console.log('  Actual:', payments.map((p) => `${nameOf(p.from)} pays ${nameOf(p.to)} ${peso(p.amount / 100)}`).join(' | ') || '(none)')
    console.log('  Expected:', EXPECTED_PAYMENTS.map((p) => `${MEMBERS.find((m) => m.key === p.from).name} pays ${MEMBERS.find((m) => m.key === p.to).name} ${peso(p.amount / 100)}`).join(' | '))
  }

  console.log(`\n${allPassed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`)
  if (!allPassed) process.exitCode = 1
}

main().catch((error) => fail(error?.message || String(error)))
