import {
  categoryBreakdown,
  isInnovationLab,
  isNamedProgram,
  programBreakdown,
  programName,
  recordsForRankings,
  recordsForMonthlyTrend,
  topDepartments,
  topSubmitters,
  topUnits,
} from "./kpi";

const record = (overrides = {}) => ({
  bejelento: "Teszt Elek",
  cimkek: [],
  customer_request_type: "Egyéb",
  feladattipus: "Innováció",
  igazgatosag: "Teszt Igazgatóság",
  szervezeti_egyseg: "Teszt Egység",
  ...overrides,
});

describe("program classification", () => {
  test("InnovationLab means Innovation type outside the Programok category", () => {
    const idea = record({ cimkek: ["AI", "VIP"] });

    expect(isInnovationLab(idea)).toBe(true);
    expect(isNamedProgram(idea)).toBe(true);
  });

  test("tasks and Programok category records are not InnovationLab ideas", () => {
    expect(isInnovationLab(record({ feladattipus: "Feladat" }))).toBe(false);
    expect(isInnovationLab(record({ customer_request_type: "Programok" }))).toBe(false);
  });

  test("named program tags are matched case-insensitively", () => {
    const idea = record({ cimkek: ["AI", "futureBET2.0"] });

    expect(isInnovationLab(idea)).toBe(true);
    expect(isNamedProgram(idea)).toBe(true);
    expect(programName(idea)).toBe("Futurebet2.0");
  });

  test("program breakdown uses the exact InnovationLab rule alongside named programs", () => {
    const records = [
      record({ cimkek: ["AI"] }),
      record({ cimkek: ["VIP"] }),
      record({ cimkek: ["mentor"], customer_request_type: "Programok" }),
      record({ feladattipus: "Feladat" }),
    ];
    const breakdown = programBreakdown(records);

    expect(breakdown).toEqual(
      expect.arrayContaining([
        { name: "InnovationLab", value: 2 },
        { name: "VIP", value: 1 },
        { name: "Mentor", value: 1 },
      ])
    );
  });
});

describe("Programok customer request type handling", () => {
  const records = [
    record(),
    record({
      bejelento: "Program Gazda",
      customer_request_type: "Programok",
      igazgatosag: "Program Igazgatóság",
      szervezeti_egyseg: "Program Egység",
    }),
  ];

  test("rankings exclude Programok records for submitters, departments and units", () => {
    expect(topSubmitters(records, 10)).toEqual([{ name: "Teszt Elek", value: 1 }]);
    expect(topDepartments(records, 10)).toEqual([{ name: "Teszt Igazgatóság", value: 1 }]);
    expect(topUnits(records, 10)).toEqual([{ name: "Teszt Egység", value: 1 }]);
    expect(recordsForRankings(records)).toEqual([records[0]]);
  });

  test("category statistics keep Programok records", () => {
    expect(categoryBreakdown(records)).toEqual(
      expect.arrayContaining([
        { name: "Egyéb", value: 1 },
        { name: "Programok", value: 1 },
      ])
    );
  });

  test("monthly trend applies the same Programok exclusion", () => {
    expect(recordsForMonthlyTrend(records)).toEqual([records[0]]);
  });

  test("Programok matching is whitespace and case insensitive", () => {
    const variants = [
      records[0],
      record({ customer_request_type: " programok " }),
      record({ customer_request_type: "PROGRAMOK" }),
    ];

    expect(recordsForRankings(variants)).toEqual([records[0]]);
  });
});
