function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers,
  });
}

function normalizeClassCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeSubjectCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20) || "MAPEL";
}

function normalizeAccountCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20);
}

function isValidClassCode(code) {
  return /^(?:[1-6])[AB]$/.test(code);
}

function normalizeMonth(value) {
  const month = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return month;
}

function normalizeYear(value) {
  const year = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null;
  return year;
}

function normalizeSemester(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "ganjil" || v === "1") return "ganjil";
  if (v === "genap" || v === "2") return "genap";
  return "ganjil";
}

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const WEEKDAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const CLASS_ORDER = ["1A","1B","2A","2B","3A","3B","4A","4B","5A","5B","6A","6B"];

const TEACHER_ACCOUNTS = [
  {
    code: "PJOK",
    name: "PJOK",
    subjectCode: "PJOK",
    teacherName: "Guru PJOK",
    sortOrder: 1,
    allowedClasses: CLASS_ORDER,
  },
  {
    code: "PAI1",
    name: "PAI 1",
    subjectCode: "PAI1",
    teacherName: "Guru PAI 1",
    sortOrder: 2,
    allowedClasses: ["1A","1B","2A","2B","3A","3B"],
  },
  {
    code: "PAI2",
    name: "PAI 2",
    subjectCode: "PAI2",
    teacherName: "Guru PAI 2",
    sortOrder: 3,
    allowedClasses: ["4A","4B","5A","5B","6A","6B"],
  },
];

function monthName(month) {
  return MONTH_NAMES[(month || 1) - 1] || "";
}

function weekdayShort(date) {
  return WEEKDAY_SHORT[new Date(date).getDay()];
}

function isoDate(year, month, day) {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function splitClassList(value) {
  return String(value || "")
    .split(",")
    .map(v => normalizeClassCode(v))
    .filter(isValidClassCode);
}

async function getColumnNames(env, tableName) {
  const result = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
  return new Set((result.results || []).map((row) => row.name));
}

async function ensureSchema(env) {
  const studentCols = await getColumnNames(env, "students");
  if (!studentCols.has("gender")) {
    await env.DB.prepare(`ALTER TABLE students ADD COLUMN gender TEXT NOT NULL DEFAULT 'L'`).run();
  }

  const classCols = await getColumnNames(env, "classes");
  if (!classCols.has("wali_kelas")) {
    await env.DB.prepare(`ALTER TABLE classes ADD COLUMN wali_kelas TEXT NOT NULL DEFAULT ''`).run();
  }
  if (!classCols.has("pin")) {
    await env.DB.prepare(`ALTER TABLE classes ADD COLUMN pin TEXT NOT NULL DEFAULT '123456'`).run();
  }

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS subject_attendance (
      date TEXT NOT NULL,
      class_code TEXT NOT NULL,
      student_id INTEGER NOT NULL,
      subject_code TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('H', 'S', 'I', 'A')),
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (date, class_code, student_id, subject_code),
      FOREIGN KEY (class_code) REFERENCES classes(code) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_subject_attendance_class_subject_date
    ON subject_attendance(class_code, subject_code, date)
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS teacher_accounts (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject_code TEXT NOT NULL,
      teacher_name TEXT NOT NULL DEFAULT '',
      allowed_classes TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 1,
      pin TEXT NOT NULL DEFAULT '123456',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  const accountCols = await getColumnNames(env, "teacher_accounts");
  if (!accountCols.has("teacher_name")) {
    await env.DB.prepare(`ALTER TABLE teacher_accounts ADD COLUMN teacher_name TEXT NOT NULL DEFAULT ''`).run();
  }

  const seedStatements = TEACHER_ACCOUNTS.map((account) => env.DB.prepare(`
    INSERT INTO teacher_accounts (code, name, subject_code, teacher_name, allowed_classes, sort_order, pin)
    VALUES (?, ?, ?, ?, ?, ?, '123456')
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      subject_code = excluded.subject_code,
      teacher_name = CASE WHEN teacher_accounts.teacher_name = '' THEN excluded.teacher_name ELSE teacher_accounts.teacher_name END,
      allowed_classes = excluded.allowed_classes,
      sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    account.code,
    account.name,
    account.subjectCode,
    account.teacherName,
    account.allowedClasses.join(","),
    account.sortOrder
  ));
  await env.DB.batch(seedStatements);

  await env.DB.prepare(`
    UPDATE classes
    SET wali_kelas = 'Fahmi Arif'
    WHERE code = '4B' AND (wali_kelas IS NULL OR wali_kelas = '')
  `).run();
}

async function ensureClasses(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS total FROM classes").first();
  if ((row?.total || 0) === 0) {
    const statements = [
      ["1A", "Kelas 1A", 1],
      ["1B", "Kelas 1B", 2],
      ["2A", "Kelas 2A", 3],
      ["2B", "Kelas 2B", 4],
      ["3A", "Kelas 3A", 5],
      ["3B", "Kelas 3B", 6],
      ["4A", "Kelas 4A", 7],
      ["4B", "Kelas 4B", 8],
      ["5A", "Kelas 5A", 9],
      ["5B", "Kelas 5B", 10],
      ["6A", "Kelas 6A", 11],
      ["6B", "Kelas 6B", 12],
    ].map(([code, name, sortOrder]) => env.DB.prepare(
      "INSERT INTO classes (code, name, sort_order, wali_kelas, pin) VALUES (?, ?, ?, ?, '123456')"
    ).bind(code, name, sortOrder, code === "4B" ? "Fahmi Arif" : ""));
    await env.DB.batch(statements);
  }
}

function badRequest(message) {
  return json({ ok: false, error: message }, { status: 400 });
}

function notFound(message = "Route tidak ditemukan") {
  return json({ ok: false, error: message }, { status: 404 });
}

async function getClasses(env) {
  const result = await env.DB.prepare(
    "SELECT code, name, sort_order AS sortOrder, wali_kelas AS waliKelas, pin FROM classes ORDER BY sort_order, code"
  ).all();
  return result.results || [];
}

async function getAccounts(env) {
  const result = await env.DB.prepare(
    `SELECT code, name, subject_code AS subjectCode, teacher_name AS teacherName,
            allowed_classes AS allowedClasses, sort_order AS sortOrder, pin
     FROM teacher_accounts
     ORDER BY sort_order, code`
  ).all();

  return (result.results || []).map(row => ({
    code: row.code,
    name: row.name,
    subjectCode: row.subjectCode || row.code,
    teacherName: row.teacherName || row.name,
    allowedClasses: splitClassList(row.allowedClasses),
    sortOrder: row.sortOrder || 1,
    pin: row.pin || "123456",
  }));
}

async function getAccountByCode(env, accountCode) {
  const result = await env.DB.prepare(
    `SELECT code, name, subject_code AS subjectCode, teacher_name AS teacherName,
            allowed_classes AS allowedClasses, sort_order AS sortOrder, pin
     FROM teacher_accounts
     WHERE code = ?`
  ).bind(accountCode).first();
  if (!result) return null;
  return {
    code: result.code,
    name: result.name,
    subjectCode: result.subjectCode || result.code,
    teacherName: result.teacherName || result.name,
    allowedClasses: splitClassList(result.allowedClasses),
    sortOrder: result.sortOrder || 1,
    pin: result.pin || "123456",
  };
}

async function getClassByCode(env, classCode) {
  const result = await env.DB.prepare(
    "SELECT code, name, sort_order AS sortOrder, wali_kelas AS waliKelas, pin FROM classes WHERE code = ?"
  ).bind(classCode).first();
  return result || null;
}

async function getStudents(env, classCode, includeInactive = false) {
  const sql = includeInactive
    ? `SELECT id, class_code AS classCode, student_order AS studentOrder, nisn, name, gender, active
       FROM students
       WHERE class_code = ?
       ORDER BY student_order, id`
    : `SELECT id, class_code AS classCode, student_order AS studentOrder, nisn, name, gender, active
       FROM students
       WHERE class_code = ? AND active = 1
       ORDER BY student_order, id`;
  const result = await env.DB.prepare(sql).bind(classCode).all();
  return result.results || [];
}

async function getAttendance(env, classCode, date, subjectCode = "") {
  if (subjectCode) {
    const result = await env.DB.prepare(
      `SELECT student_id AS studentId, status, note
       FROM subject_attendance
       WHERE class_code = ? AND date = ? AND subject_code = ?`
    ).bind(classCode, date, normalizeSubjectCode(subjectCode)).all();
    return result.results || [];
  }

  const result = await env.DB.prepare(
    `SELECT student_id AS studentId, status, note
     FROM attendance
     WHERE class_code = ? AND date = ?`
  ).bind(classCode, date).all();
  return result.results || [];
}

async function getAttendanceRange(env, classCode, startDate, endDate, subjectCode = "") {
  if (subjectCode) {
    const result = await env.DB.prepare(
      `SELECT date, student_id AS studentId, status, note
       FROM subject_attendance
       WHERE class_code = ? AND subject_code = ? AND date BETWEEN ? AND ?
       ORDER BY date, student_id`
    ).bind(classCode, normalizeSubjectCode(subjectCode), startDate, endDate).all();
    return result.results || [];
  }

  const result = await env.DB.prepare(
    `SELECT date, student_id AS studentId, status, note
     FROM attendance
     WHERE class_code = ? AND date BETWEEN ? AND ?
     ORDER BY date, student_id`
  ).bind(classCode, startDate, endDate).all();
  return result.results || [];
}

async function getAttendanceDates(env, classCode, startDate, endDate, subjectCode = "") {
  if (subjectCode) {
    const result = await env.DB.prepare(
      `SELECT DISTINCT date
       FROM subject_attendance
       WHERE class_code = ? AND subject_code = ? AND date BETWEEN ? AND ?
       ORDER BY date`
    ).bind(classCode, normalizeSubjectCode(subjectCode), startDate, endDate).all();
    return (result.results || []).map(row => row.date);
  }

  const result = await env.DB.prepare(
    `SELECT DISTINCT date
     FROM attendance
     WHERE class_code = ? AND date BETWEEN ? AND ?
     ORDER BY date`
  ).bind(classCode, startDate, endDate).all();
  return (result.results || []).map(row => row.date);
}


async function clearAttendance(env, classCode, date, subjectCode = "") {
  if (subjectCode) {
    const result = await env.DB.prepare(
      "DELETE FROM subject_attendance WHERE class_code = ? AND date = ? AND subject_code = ?"
    ).bind(classCode, date, normalizeSubjectCode(subjectCode)).run();
    return result.meta?.changes || 0;
  }
  const result = await env.DB.prepare(
    "DELETE FROM attendance WHERE class_code = ? AND date = ?"
  ).bind(classCode, date).run();
  return result.meta?.changes || 0;
}

async function upsertAttendance(env, classCode, date, records, replace = false, subjectCode = "") {
  if (!Array.isArray(records)) return 0;
  const statements = [];
  const normalizedSubject = normalizeSubjectCode(subjectCode);

  if (subjectCode) {
    if (replace) {
      statements.push(
        env.DB.prepare("DELETE FROM subject_attendance WHERE class_code = ? AND date = ? AND subject_code = ?").bind(classCode, date, normalizedSubject)
      );
    }

    for (const row of records) {
      const studentId = Number(row?.studentId);
      const status = String(row?.status || "").trim().toUpperCase();
      const note = String(row?.note || "").trim();
      if (!studentId || !["H", "S", "I", "A"].includes(status)) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO subject_attendance (date, class_code, student_id, subject_code, status, note, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(date, class_code, student_id, subject_code)
           DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = CURRENT_TIMESTAMP`
        ).bind(date, classCode, studentId, normalizedSubject, status, note)
      );
    }
  } else {
    if (replace) {
      statements.push(
        env.DB.prepare("DELETE FROM attendance WHERE class_code = ? AND date = ?").bind(classCode, date)
      );
    }

    for (const row of records) {
      const studentId = Number(row?.studentId);
      const status = String(row?.status || "").trim().toUpperCase();
      const note = String(row?.note || "").trim();
      if (!studentId || !["H", "S", "I", "A"].includes(status)) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO attendance (date, class_code, student_id, status, note, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(date, class_code, student_id)
           DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = CURRENT_TIMESTAMP`
        ).bind(date, classCode, studentId, status, note)
      );
    }
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
  return statements.length;
}

async function saveRoster(env, classCode, students) {
  if (!Array.isArray(students)) return 0;
  const statements = [];
  const normalized = students
    .map((row) => ({
      id: row?.id ? Number(row.id) : null,
      nisn: String(row?.nisn || "").trim(),
      name: String(row?.name || "").trim(),
      gender: String(row?.gender || "L").trim().toUpperCase().startsWith("P") ? "P" : "L",
      active: row?.active === false || row?.active === 0 || row?.active === "0" ? 0 : 1,
    }))
    .filter(row => row.name.length > 0 || row.id);

  for (const [index, row] of normalized.entries()) {
    const studentOrder = index + 1;
    if (row.id) {
      statements.push(
        env.DB.prepare(
          `UPDATE students
           SET nisn = ?, name = ?, gender = ?, student_order = ?, active = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND class_code = ?`
        ).bind(row.nisn, row.name, row.gender, studentOrder, row.active, row.id, classCode)
      );
    } else if (row.name) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO students (class_code, student_order, nisn, name, gender, active)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(classCode, studentOrder, row.nisn, row.name, row.gender, row.active)
      );
    }
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
  return statements.length;
}

async function moveRoster(env, fromClassCode, toClassCode) {
  const result = await env.DB.prepare(
    `SELECT id, student_order AS studentOrder
     FROM students
     WHERE class_code = ? AND active = 1
     ORDER BY student_order, id`
  ).bind(fromClassCode).all();
  const rows = result.results || [];
  if (!rows.length) return 0;

  const target = await env.DB.prepare(
    `SELECT COALESCE(MAX(student_order), 0) AS maxOrder
     FROM students
     WHERE class_code = ?`
  ).bind(toClassCode).first();
  const startOrder = Number(target?.maxOrder || 0);

  const statements = rows.map((row, idx) => env.DB.prepare(
    `UPDATE students
     SET class_code = ?, student_order = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(toClassCode, startOrder + idx + 1, row.id));

  await env.DB.batch(statements);
  return statements.length;
}

async function deleteClassRoster(env, classCode) {
  const statements = [
    env.DB.prepare("DELETE FROM attendance WHERE class_code = ?").bind(classCode),
    env.DB.prepare("DELETE FROM subject_attendance WHERE class_code = ?").bind(classCode),
    env.DB.prepare("DELETE FROM students WHERE class_code = ?").bind(classCode),
  ];
  await env.DB.batch(statements);
  return true;
}


function makeReportStudents(students, attendanceRows) {
  const attendanceByStudent = new Map();
  for (const row of attendanceRows) {
    if (!attendanceByStudent.has(String(row.studentId))) {
      attendanceByStudent.set(String(row.studentId), {});
    }
    attendanceByStudent.get(String(row.studentId))[row.date] = row.status;
  }

  return students.map((student) => {
    const byDate = attendanceByStudent.get(String(student.id)) || {};
    const totals = { H: 0, S: 0, I: 0, A: 0 };

    for (const status of Object.values(byDate)) {
      if (totals[status] !== undefined) totals[status] += 1;
    }

    return {
      id: student.id,
      nisn: student.nisn || "",
      name: student.name || "",
      gender: student.gender || "L",
      studentOrder: student.studentOrder || 0,
      attendance: byDate,
      totals,
    };
  });
}

async function getMonthlyReport(env, classCode, month, year, subjectCode = "") {
  const classRow = await getClassByCode(env, classCode);
  if (!classRow) return null;

  const totalDays = daysInMonth(year, month);
  const startDate = isoDate(year, month, 1);
  const endDate = isoDate(year, month, totalDays);

  const students = await getStudents(env, classCode, false);
  const attendanceRows = await getAttendanceRange(env, classCode, startDate, endDate, subjectCode);
  const days = Array.from({ length: totalDays }, (_, idx) => {
    const day = idx + 1;
    const date = isoDate(year, month, day);
    return {
      date,
      day,
      month,
      monthName: monthName(month),
      year,
      weekday: weekdayShort(date),
    };
  });

  return {
    class: {
      code: classRow.code,
      name: classRow.name,
      waliKelas: classRow.waliKelas || "",
    },
    month,
    year,
    monthLabel: `${monthName(month)} ${year}`,
    days,
    students: makeReportStudents(students, attendanceRows),
  };
}

async function getSemesterReport(env, classCode, semester, academicStartYear, subjectCode = "", accountCode = "") {
  const classRow = await getClassByCode(env, classCode);
  if (!classRow) return null;

  const account = accountCode ? await getAccountByCode(env, accountCode) : null;
  const semesterNormalized = normalizeSemester(semester);
  const calendarYear = semesterNormalized === "ganjil" ? academicStartYear : academicStartYear + 1;
  const months = semesterNormalized === "ganjil" ? [7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6];
  const startDate = isoDate(calendarYear, months[0], 1);
  const endDate = isoDate(calendarYear, months[months.length - 1], daysInMonth(calendarYear, months[months.length - 1]));
  const normalizedSubject = normalizeSubjectCode(subjectCode || account?.subjectCode || accountCode || "MAPEL");

  const students = await getStudents(env, classCode, false);
  const attendanceRows = await getAttendanceRange(env, classCode, startDate, endDate, normalizedSubject);
  const attendanceDates = await getAttendanceDates(env, classCode, startDate, endDate, normalizedSubject);
  const days = attendanceDates.map(date => {
    const [y, m, d] = date.split("-").map(Number);
    return {
      date,
      day: d,
      month: m,
      monthName: monthName(m),
      year: y,
      weekday: weekdayShort(date),
    };
  });

  return {
    class: {
      code: classRow.code,
      name: classRow.name,
      waliKelas: classRow.waliKelas || "",
    },
    account: account ? {
      code: account.code,
      name: account.name,
      subjectCode: account.subjectCode,
      teacherName: account.teacherName,
    } : null,
    subjectCode: normalizedSubject,
    teacherName: account?.teacherName || account?.name || "",
    academicYear: `${academicStartYear}/${academicStartYear + 1}`,
    academicStartYear,
    calendarYear,
    semester: semesterNormalized,
    semesterLabel: semesterNormalized === "ganjil" ? "Semester Ganjil" : "Semester Genap",
    months: months.map(month => ({ month, label: monthName(month), year: calendarYear })),
    startDate,
    endDate,
    days,
    students: makeReportStudents(students, attendanceRows),
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      }
    });
  }

  try {
    await ensureSchema(env);
    await ensureClasses(env);

    const action = url.searchParams.get("action") || "classes";
    const method = request.method.toUpperCase();

    if (method === "GET") {
      if (action === "classes") {
        return json({ ok: true, classes: await getClasses(env) });
      }

      if (action === "accounts") {
        return json({ ok: true, accounts: await getAccounts(env) });
      }

      if (action === "students") {
        const classCode = normalizeClassCode(url.searchParams.get("classCode"));
        const includeInactive = String(url.searchParams.get("includeInactive") || "") === "1";
        if (!isValidClassCode(classCode)) return badRequest("Kode kelas tidak valid.");
        return json({ ok: true, students: await getStudents(env, classCode, includeInactive) });
      }

      if (action === "attendance") {
        const classCode = normalizeClassCode(url.searchParams.get("classCode"));
        const date = String(url.searchParams.get("date") || "").trim();
        const subjectCode = normalizeSubjectCode(url.searchParams.get("subjectCode") || "");
        if (!isValidClassCode(classCode)) return badRequest("Kode kelas tidak valid.");
        if (!date) return badRequest("Tanggal wajib diisi.");
        return json({ ok: true, records: await getAttendance(env, classCode, date, subjectCode) });
      }

      if (action === "monthlyReport") {
        const classCode = normalizeClassCode(url.searchParams.get("classCode"));
        const month = normalizeMonth(url.searchParams.get("month"));
        const year = normalizeYear(url.searchParams.get("year"));
        const subjectCode = normalizeSubjectCode(url.searchParams.get("subjectCode") || "");
        if (!isValidClassCode(classCode)) return badRequest("Kode kelas tidak valid.");
        if (!month || !year) return badRequest("Bulan atau tahun tidak valid.");
        const report = await getMonthlyReport(env, classCode, month, year, subjectCode);
        if (!report) return notFound("Kelas tidak ditemukan.");
        return json({ ok: true, report });
      }

      if (action === "semesterReport") {
        const classCode = normalizeClassCode(url.searchParams.get("classCode"));
        const semester = normalizeSemester(url.searchParams.get("semester"));
        const year = normalizeYear(url.searchParams.get("year"));
        const subjectCode = normalizeSubjectCode(url.searchParams.get("subjectCode") || "");
        const accountCode = normalizeAccountCode(url.searchParams.get("accountCode") || "");
        if (!isValidClassCode(classCode)) return badRequest("Kode kelas tidak valid.");
        if (!year) return badRequest("Tahun pelajaran tidak valid.");
        const report = await getSemesterReport(env, classCode, semester, year, subjectCode, accountCode);
        if (!report) return notFound("Kelas tidak ditemukan.");
        return json({ ok: true, report });
      }

      return notFound();
    }

    if (method === "POST") {
      const payload = await request.json().catch(() => ({}));
      const actionPost = String(payload?.action || action || "").trim();

      if (actionPost === "saveAttendance") {
        const classCode = normalizeClassCode(payload.classCode);
        const date = String(payload.date || "").trim();
        const subjectCode = normalizeSubjectCode(payload.subjectCode || "");
        if (!isValidClassCode(classCode)) return badRequest("Kode kelas tidak valid.");
        if (!date) return badRequest("Tanggal wajib diisi.");

        const saved = await upsertAttendance(env, classCode, date, payload.records || [], Boolean(payload.replace), subjectCode);
        return json({ ok: true, saved });
      }

      if (actionPost === "saveRoster") {
        const classCode = normalizeClassCode(payload.classCode);
        if (!isValidClassCode(classCode)) return badRequest("Kode kelas tidak valid.");
        const saved = await saveRoster(env, classCode, payload.students || []);
        return json({ ok: true, saved });
      }

      if (actionPost === "changePin" || actionPost === "changeAccountPin") {
        const accountCode = normalizeAccountCode(payload.accountCode || payload.classCode);
        if (!accountCode) return badRequest("Akun tidak valid.");

        const row = await env.DB.prepare(
          "SELECT pin FROM teacher_accounts WHERE code = ?"
        ).bind(accountCode).first();

        if (!row) return badRequest("Akun tidak ditemukan.");

        if (String(row.pin || "") !== String(payload.oldPin || "")) {
          return badRequest("PIN lama salah.");
        }

        await env.DB.prepare(
          "UPDATE teacher_accounts SET pin = ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?"
        ).bind(String(payload.newPin || ""), accountCode).run();

        return json({ ok: true });
      }

      if (actionPost === "moveRoster" || actionPost === "copyRoster") {
        const fromClassCode = normalizeClassCode(payload.fromClassCode);
        const toClassCode = normalizeClassCode(payload.toClassCode);
        if (!isValidClassCode(fromClassCode) || !isValidClassCode(toClassCode)) {
          return badRequest("Kode kelas sumber atau tujuan tidak valid.");
        }
        const moved = await moveRoster(env, fromClassCode, toClassCode);
        return json({ ok: true, moved });
      }

      if (actionPost === "clearAttendance") {
        const classCode = normalizeClassCode(payload.classCode);
        const date = String(payload.date || "").trim();
        const subjectCode = normalizeSubjectCode(payload.subjectCode || "");
        if (!isValidClassCode(classCode)) return badRequest("Kode kelas tidak valid.");
        if (!date) return badRequest("Tanggal wajib diisi.");
        const cleared = await clearAttendance(env, classCode, date, subjectCode);
        return json({ ok: true, cleared });
      }

      if (actionPost === "deleteClassRoster") {
        const classCode = normalizeClassCode(payload.classCode);
        if (!isValidClassCode(classCode)) return badRequest("Kode kelas tidak valid.");
        await deleteClassRoster(env, classCode);
        return json({ ok: true });
      }

      return notFound();
    }

    return notFound();
  } catch (error) {
    return json({
      ok: false,
      error: error?.message || "Terjadi kesalahan server",
    }, { status: 500 });
  }
}
