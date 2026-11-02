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
