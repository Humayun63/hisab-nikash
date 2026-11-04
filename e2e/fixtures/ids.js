// IDs and credentials created by seed.sql. Keep the two files in sync.
export const TEST_PASSWORD = 'E2e-Test-Pass-1!'

export const USERS = {
  superAdmin: { id: 'a0000000-0000-4000-8000-000000000001', email: 'sa@e2e.hisab-nikash.test' },
  viewer: { id: 'a0000000-0000-4000-8000-000000000002', email: 'viewer@e2e.hisab-nikash.test' },
  editor: { id: 'a0000000-0000-4000-8000-000000000003', email: 'editor@e2e.hisab-nikash.test' },
  admin: { id: 'a0000000-0000-4000-8000-000000000004', email: 'admin@e2e.hisab-nikash.test' },
  granted: { id: 'a0000000-0000-4000-8000-000000000005', email: 'granted@e2e.hisab-nikash.test' },
  disabled: { id: 'a0000000-0000-4000-8000-000000000006', email: 'disabled@e2e.hisab-nikash.test' },
  invited: { id: 'a0000000-0000-4000-8000-000000000007', email: 'invited@e2e.hisab-nikash.test' },
  newOwner: { id: 'a0000000-0000-4000-8000-000000000008', email: 'newowner@e2e.hisab-nikash.test' },
  otherSuperAdmin: { id: 'b0000000-0000-4000-8000-000000000001', email: 'othersa@e2e.hisab-nikash.test' },
  // UI test users (e2e/ui)
  uiOwner: { id: 'a0000000-0000-4000-8000-000000000101', email: 'uiowner@e2e.hisab-nikash.test' }, // verified, no org yet
  mustChange: { id: 'a0000000-0000-4000-8000-000000000102', email: 'mustchange@e2e.hisab-nikash.test' }, // invited, must change password
  resetter: { id: 'a0000000-0000-4000-8000-000000000103', email: 'resetter@e2e.hisab-nikash.test' }, // active editor
}

export const ORG_A = 'a1000000-0000-4000-8000-000000000001'
export const ORG_B = 'b1000000-0000-4000-8000-000000000001'

export const SPACES = {
  office: 'a2000000-0000-4000-8000-000000000001',
  secret: 'a2000000-0000-4000-8000-000000000002',
  orgB: 'b2000000-0000-4000-8000-000000000001',
}

export const FOLDERS = {
  office: 'a3000000-0000-4000-8000-000000000001',
}

export const FILES = {
  office: 'a4000000-0000-4000-8000-000000000001',
  secret: 'a4000000-0000-4000-8000-000000000002',
  orgB: 'b4000000-0000-4000-8000-000000000001',
}

export const CATEGORIES = {
  rent: 'a5000000-0000-4000-8000-000000000001',
  salary: 'a5000000-0000-4000-8000-000000000002',
  personal: 'a5000000-0000-4000-8000-000000000003', // restricted, granted to `granted`
  old: 'a5000000-0000-4000-8000-000000000004', // archived
  hidden: 'a5000000-0000-4000-8000-000000000005', // in the Secret space
  orgB: 'b5000000-0000-4000-8000-000000000001',
}

// ---------------------------------------------------------------------------
// Milestone 3: user/space management
// ---------------------------------------------------------------------------
// Org C — UI tests (e2e/ui/management.spec.js). Users created by tests use *@e2e.hisab-nikash.test.
export const ORG_C = {
  id: 'c1000000-0000-4000-8000-000000000001',
  name: 'E2E Org C',
  superAdmin: { id: 'c0000000-0000-4000-8000-000000000001', email: 'uisa@e2e.hisab-nikash.test', name: 'Cara Chief' },
  member: { id: 'c0000000-0000-4000-8000-000000000002', email: 'uimember@e2e.hisab-nikash.test', name: 'Max Member' }, // editor in C Office
  toggle: { id: 'c0000000-0000-4000-8000-000000000003', email: 'uidisable@e2e.hisab-nikash.test', name: 'Dora Toggle' }, // no spaces
  spaces: {
    office: { id: 'c2000000-0000-4000-8000-000000000001', name: 'C Office' },
    projects: { id: 'c2000000-0000-4000-8000-000000000002', name: 'C Projects' },
  },
}

// Org D — admin-users Edge Function API tests (e2e/db/admin-users.spec.js).
export const ORG_D = {
  id: 'd1000000-0000-4000-8000-000000000001',
  superAdmin: { id: 'd0000000-0000-4000-8000-000000000001', email: 'fnsa@e2e.hisab-nikash.test' },
  viewer: { id: 'd0000000-0000-4000-8000-000000000002', email: 'fnviewer@e2e.hisab-nikash.test' },
  target: { id: 'd0000000-0000-4000-8000-000000000003', email: 'fntarget@e2e.hisab-nikash.test' }, // gets updated/disabled
  deletable: { id: 'd0000000-0000-4000-8000-000000000004', email: 'fndelete@e2e.hisab-nikash.test' }, // has one entry ("by dell")
  space: { id: 'd2000000-0000-4000-8000-000000000001', name: 'D Space' },
}

// ---------------------------------------------------------------------------
// Milestone 4: folders, files, categories
// ---------------------------------------------------------------------------
// Org E. "E Office" is for the UI tests (e2e/ui/structure.spec.js), which may change it;
// "E Data" is for the API tests (e2e/db/structure.spec.js). Same members and roles in both.
// Entries per file (visible to everyone unless marked restricted):
//   Daily Costs: Sales +5000, Rent -1200, Private -300 (restricted)   Payroll: Sales +1000   Website: none
//   Data File A: D Income +1000, D Expense -400, D Restricted -250 (restricted), D Archived -50 (archived)
//   Data File B: none
export const ORG_E = {
  id: 'e1000000-0000-4000-8000-000000000001',
  name: 'E2E Org E',
  superAdmin: { id: 'e0000000-0000-4000-8000-000000000001', email: 'esa@e2e.hisab-nikash.test', name: 'Erin Super' },
  admin: { id: 'e0000000-0000-4000-8000-000000000002', email: 'eadmin@e2e.hisab-nikash.test', name: 'Abe Admin' },
  editor: { id: 'e0000000-0000-4000-8000-000000000003', email: 'eeditor@e2e.hisab-nikash.test', name: 'Ed Editor' },
  viewer: { id: 'e0000000-0000-4000-8000-000000000004', email: 'eviewer@e2e.hisab-nikash.test', name: 'Vera Viewer' },
  granted: { id: 'e0000000-0000-4000-8000-000000000005', email: 'egranted@e2e.hisab-nikash.test', name: 'Gus Granted' }, // viewer, may see the restricted categories
  outsider: { id: 'e0000000-0000-4000-8000-000000000006', email: 'eoutsider@e2e.hisab-nikash.test', name: 'Olly Outside' }, // org member, no spaces
  office: {
    id: 'e2000000-0000-4000-8000-000000000001',
    name: 'E Office',
    folders: {
      operations: { id: 'e3000000-0000-4000-8000-000000000001', name: 'Operations' },
      projects: { id: 'e3000000-0000-4000-8000-000000000002', name: 'Projects' },
      empty: { id: 'e3000000-0000-4000-8000-000000000003', name: 'Empty Folder' },
    },
    files: {
      daily: { id: 'e4000000-0000-4000-8000-000000000001', name: 'Daily Costs' }, // in Operations
      payroll: { id: 'e4000000-0000-4000-8000-000000000002', name: 'Payroll' }, // in Operations
      website: { id: 'e4000000-0000-4000-8000-000000000003', name: 'Website' }, // in Projects, no entries
    },
    categories: {
      rent: { id: 'e5000000-0000-4000-8000-000000000001', name: 'Rent' }, // expense, 1 entry
      sales: { id: 'e5000000-0000-4000-8000-000000000002', name: 'Sales' }, // income, 2 entries
      private: { id: 'e5000000-0000-4000-8000-000000000003', name: 'Private' }, // expense, restricted, 1 entry
      legacy: { id: 'e5000000-0000-4000-8000-000000000004', name: 'Legacy' }, // expense, archived, no entries
      unused: { id: 'e5000000-0000-4000-8000-000000000005', name: 'Unused' }, // income, no entries
    },
  },
  data: {
    id: 'e2000000-0000-4000-8000-000000000002',
    name: 'E Data',
    folder: { id: 'e3000000-0000-4000-8000-000000000011', name: 'Data Folder' },
    files: {
      a: { id: 'e4000000-0000-4000-8000-000000000011', name: 'Data File A' },
      b: { id: 'e4000000-0000-4000-8000-000000000012', name: 'Data File B' },
    },
    categories: {
      income: { id: 'e5000000-0000-4000-8000-000000000011', name: 'D Income' },
      expense: { id: 'e5000000-0000-4000-8000-000000000012', name: 'D Expense' },
      restricted: { id: 'e5000000-0000-4000-8000-000000000013', name: 'D Restricted' },
      archived: { id: 'e5000000-0000-4000-8000-000000000014', name: 'D Archived' },
    },
  },
}

// Org F (milestone 5, entries). "F Ledger" is for the UI tests (e2e/ui/entries.spec.js), which
// may change it; "F Data" is for the API tests (e2e/db/entries.spec.js). Same members in both:
// admin, two editors, a viewer and a viewer granted the restricted category. Dates are days
// before today in Asia/Dhaka.
//   Cash Book: Salary +50000 (5d, editor), Groceries -1250.50 (today, editor), Rent -15000 (1d, admin),
//              Secret -700 (2d, super admin, restricted), Old -100 (40d, editor2, archived),
//              Groceries -300 (3d, deleted user: created_by null), Bonus +2000 (40d, editor2)
//   Bulk:      55 × Groceries, amounts 1…55, 10d, editor ("bulk 1" … "bulk 55")
//   Empty Book: none
//   Data A:    D Income +1000 (1d, editor), D Expense -400 (today, admin),
//              D Secret -250 (today, super admin, restricted), D Old -50 (3d, editor, archived)
//   Data B:    D Expense -75 (2d, editor2)
export const ORG_F = {
  id: 'f1000000-0000-4000-8000-000000000001',
  name: 'E2E Org F',
  superAdmin: { id: 'f0000000-0000-4000-8000-000000000001', email: 'fsa@e2e.hisab-nikash.test', name: 'Fay Super' },
  admin: { id: 'f0000000-0000-4000-8000-000000000002', email: 'fadmin@e2e.hisab-nikash.test', name: 'Ada Admin' },
  editor: { id: 'f0000000-0000-4000-8000-000000000003', email: 'feditor@e2e.hisab-nikash.test', name: 'Eli Editor' },
  editor2: { id: 'f0000000-0000-4000-8000-000000000004', email: 'feditor2@e2e.hisab-nikash.test', name: 'Zoe Writer' },
  viewer: { id: 'f0000000-0000-4000-8000-000000000005', email: 'fviewer@e2e.hisab-nikash.test', name: 'Val Viewer' },
  granted: { id: 'f0000000-0000-4000-8000-000000000006', email: 'fgranted@e2e.hisab-nikash.test', name: 'Gil Granted' }, // viewer, may see Secret / D Secret
  outsider: { id: 'f0000000-0000-4000-8000-000000000007', email: 'foutsider@e2e.hisab-nikash.test', name: 'Oz Outside' }, // org member, no spaces
  ledger: {
    id: 'f2000000-0000-4000-8000-000000000001',
    name: 'F Ledger',
    folder: { id: 'f3000000-0000-4000-8000-000000000001', name: 'Main' },
    files: {
      cash: { id: 'f4000000-0000-4000-8000-000000000001', name: 'Cash Book' },
      bulk: { id: 'f4000000-0000-4000-8000-000000000002', name: 'Bulk' },
      empty: { id: 'f4000000-0000-4000-8000-000000000003', name: 'Empty Book' },
    },
    categories: {
      groceries: { id: 'f5000000-0000-4000-8000-000000000001', name: 'Groceries' }, // expense
      rent: { id: 'f5000000-0000-4000-8000-000000000002', name: 'Rent' }, // expense
      salary: { id: 'f5000000-0000-4000-8000-000000000003', name: 'Salary' }, // income
      bonus: { id: 'f5000000-0000-4000-8000-000000000004', name: 'Bonus' }, // income
      secret: { id: 'f5000000-0000-4000-8000-000000000005', name: 'Secret' }, // expense, restricted (granted)
      old: { id: 'f5000000-0000-4000-8000-000000000006', name: 'Old' }, // expense, archived
    },
    entries: {
      salary: 'f6000000-0000-4000-8000-000000000001',
      groceries: 'f6000000-0000-4000-8000-000000000002',
      rent: 'f6000000-0000-4000-8000-000000000003',
      secret: 'f6000000-0000-4000-8000-000000000004',
      old: 'f6000000-0000-4000-8000-000000000005',
      deletedUser: 'f6000000-0000-4000-8000-000000000006',
      bonus: 'f6000000-0000-4000-8000-000000000007',
    },
  },
  data: {
    id: 'f2000000-0000-4000-8000-000000000002',
    name: 'F Data',
    folder: { id: 'f3000000-0000-4000-8000-000000000011', name: 'Data Folder' },
    files: {
      a: { id: 'f4000000-0000-4000-8000-000000000011', name: 'Data A' },
      b: { id: 'f4000000-0000-4000-8000-000000000012', name: 'Data B' },
    },
    categories: {
      income: { id: 'f5000000-0000-4000-8000-000000000011', name: 'D Income' },
      expense: { id: 'f5000000-0000-4000-8000-000000000012', name: 'D Expense' },
      secret: { id: 'f5000000-0000-4000-8000-000000000013', name: 'D Secret' }, // restricted (granted)
      old: { id: 'f5000000-0000-4000-8000-000000000014', name: 'D Old' }, // archived
    },
    entries: {
      income: 'f6000000-0000-4000-8000-000000000011',
      expense: 'f6000000-0000-4000-8000-000000000012',
      secret: 'f6000000-0000-4000-8000-000000000013',
      old: 'f6000000-0000-4000-8000-000000000014',
      dataB: 'f6000000-0000-4000-8000-000000000015',
    },
  },
}
