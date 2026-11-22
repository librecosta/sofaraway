// Frozen original identities preserve the approved noise seeds.
const starwakeEventIds = [
  0,3,5,7,8,10,12,14,15,17,18,20,23,24,26,27,29,30,33,34,35,37,38,40,
  41,42,45,46,48,49,51,52,53,54,55,56,58,60,61,63,64,66,68,70,71,73,75,77,
  79,80,82,84,85,86,88,90,92,93,95,96,98,100,101,103,105,106,108,110,111,113,115,117,
  119,121,122,124,126,128,130,132,133,134,137,138,139,140,143,144,146,148,149,151,153,154,157,158,
  159,160,163,164,166,168,169,170,171,173,175,176,177,180,181,182,183,186,187,188,190,192,193,195,
  197,198,199,202,203,204,205,208,210,211,213,214,215,217,219,220,221,222,224,225,227,228,231,232,
  235,236,237,238,241,243,244,246,248,249,252,253,254,257,258,259,262,263,265,266,268,269,271,272,
  275,276,277,280,281,282,283,284,287,288,290,292,294,297,298,299,300,303,304,307,309,310,312,314,
  315,316,318,319,322,323,324,326,328,329,331,333,334,336,337,338,341,342,343,344,346,348,349,351,
  353,354,356,357,358,359,362,363,364,366,368,369,371,373,374,375,377,379,381,382,383,384,385,386,
  387,388,389,390,391,393,395,396,398,399,401,403,405,406,407,409,411,413,415,416,418,420,421,422,
  424,426,427,428,430,432,433,434,436,438,439,441,443,444,445,447,449,450,452,454,455,457,459,460,
  461,463,465,467,469,470,471,473,475,476,477,480,481,482,483,486,487,489,491,492,494,496,497,500,
  501,502,503,506,507,509,511,512,513,514,516,518,519,520,523,524,525,526,529,530,531,533,535,536,
  537,539,541,542,543,546,547,548,549,552,554,555,557,558,559,561,563,564,565,566,567,569,571,572,
  575,576,577,580,581,582,585,587,588,590,592,593,596,597,598,601,602,605,606,607,609,610,612,614,
  615,616,619,620,621,624,625,626,627,630,631,633,635,637,638,641,642,643,646,647,650,652,653,655,
  656,658,659,660,662,664,665,667,668,670,672,673,675,677,678,679,681,682,684,686,687,688,690,692,
  693,695,696,698,699,700,702,703,705,707,708,709,711,713,714,716,718,719,720,722,723,725,726,728,
  729,730,731,732,733,734,736,738,739,740,743,745,748,749,750,751,754,756,758,759,761,762,765,767,
  770,771,772,773,774,777,778,779,781,782,784,786,787,788,791,793,796,797,798,799,802,803,804,806,
  807,809,811,814,815,816,818,821,822,825,827,828,830,832,833,834,836,837,839,841,842,844,846,847,
  849,851,852,854,855,856,858,860,861,862,863,865,867,868,870,872,873,875,876,877,878,880,882,883,
  885,887,888,890,892,893,894,896,897,899,901,902,903,904,906,908,909,910,911,914,915,916,917,919,
  922,924,925,927,928,930,932,933,936,937,938,940,943,945,947,948,949,950,951,953,954,956,957,960,
  961,962,963,965,968,970,972,973,974,976,977,979,980,983,984,986,987,990,991,993,995,997,998,1000,
  1001,1002,1003,1005,1007,1008,1009,1011,1012,1015,1016,1017,1018,1020,1022,1024,1025,1027,1028,1030,1031,1032,1035,1036,
  1037,1038,1040,1042,1043,1045,1047,1048,1049,1051,1052,1053,1056,1057,1058,1059,1060,1062,1064,1065,1067,1069,1070,1072,
  1073,1075,1077,1079,1080,1081,1083,1084,1085,1086,1088,1089,1090,1091,1093,1094,1096,1098,1099,1100,1104,1105,1109,1110,
  1111,1114,1116,1117,1119,1120,1121,1122,1123,1124,1125,1126,1128,1130,1131,1133,1134,1135,1137,1139,1140,1141,1143,1144,
  1146,1148,1149,1151,1152,1153,1154,1156,1158,1159,1160,1162,1163,1164,1165,1167,1169,1170,1172,1173,1174,1175,1177,1179,
  1180,1181,1183,1184,1185,1186,1188,1190,1191,1192,1194,1195,1197,1199,1200,1201,1203,1204,1205,1206,1208,1210,1211,1212,
  1214,1215,1217,1219,1220,1222,1223,1224,1226,1228,1229,1230,1232,1233,1235,1237,1238,1240,1241,1242,1243,1244,1246,1248,
  1249,1250,1252,1253,1255,1257,1258,1259,1260,1262,1263,1264,1266,1268,1269,1270,1271,1273,1275,1277,1278,1279,1281,1282,
  1283,1284,1285,1286,1288,1290,1291,1293,1294,1296,1298,1300,1301,1302,1304,1305,1307,1309,1310,1312,1314,1315,1316,1318,
  1320,1321,1322,1324,1325,1326,1327,1329,1331,1332,1334,1336,1337,1338,1340,1342,1343,1345,1346,1347,1348,1350,1352,1353,
  1354,1356,1358,1360,1362,1363,1365,1366,1367,1368,1370,1372,1373,1375,1376,1378,1380,1381,1382,1384,1385,1387,1389,1390,
  1392,1393,1394,1395,1397,1399,1400,1401,1403,1404,1405,1406,1408,1410,1411,1413,1414,1415,1417,1419,1420,1421,1422,1424,
  1425,1426,1427,1429,1431,1432,1433,1435,1436,1438,1439,1441,1442,1443,1444,1445,1446,1447,1448,1449,1451,1453,1454,1455,
  1458,1459,1461,1463,1465,1467,1468,1470,1472,1473,1474,1477,1478,1480,1482,1484,1485,1486,1488,1489,1491,1493,1494,1495,
  1496,1499,1500,1502,1504,1505,1507,1508,1510,1512,1514,1515,1516,1517,1520,1522,1524,1526,1528,1529,1530,1533,1534,1535,
  1537,1539,1541,1542,1544,1545,1547,1549,1550,1553,1554,1555,1557,1559,1560,1562,1564,1566,1567,1569,1570,1573,1574,1575,
  1576,1578,1580,1581,1583,1585,1586,1587,1589,1591,1592,1595,1596,1598,1599,1601,1602,1604,1606,1607,1608,1610,1612,1613,
  1614,1615,1616,1618,1620,1621,1622,1623,1626,1627,1628,1629,1630,1632,1634,1636,1637,1638,1639,1640,1643,1644,1645,1646,
  1648,1649,1651,1653,1654,1655,1656,1659,1660,1661,1663,1665,1667,1668,1669,1672,1674,1675,1676,1678,1680,1682,1683,1685,
  1687,1688,1689,1690,1691,
] as const;

export const bpm = 128;
export const beatSeconds = 60 / bpm;
export const step = beatSeconds / 4;
export const seed = 0x41535452;

let startBar = 0;
const sections = ([['OUTER BELT', 8], ['DRIFT', 16], ['RINGBREAK', 16], ['MAELSTROM', 16],
  ['ECLIPSE', 8], ['AURORA', 16], ['APHELION', 16]] as const).map(([name, bars]) => {
  const start = startBar;
  startBar += bars;
  return { name, bars, startBar: start, endBar: startBar, startBeat: start * 4,
    endBeat: startBar * 4, start: start * 4 * beatSeconds, end: startBar * 4 * beatSeconds };
});

export const starwakeTrack = {
  id: 'starwake', title: 'ORBIT — STARWAKE', bpm, beatsPerBar: 4,
  bars: 96, beats: 384, duration: 180, tail: 4, seed, sections,
} as const;

type Common = { id: number; identity: string; bar: number; beat: number; at: number; velocity: number;
  section: string; accent: boolean; fill: boolean; transition: boolean; pan?: number };
export type OrbitEvent = Common & (
  | { voice: 'kick' }
  | { voice: 'snare'; ghost?: boolean }
  | { voice: 'hat'; open: boolean }
  | { voice: 'perc'; note: number }
  | { voice: 'bass' | 'pluck'; note: number; length: number }
  | { voice: 'lead'; note: number; length: number; motif: string }
  | { voice: 'pad'; notes: readonly number[]; length: number; color: number }
  | { voice: 'sweep'; length: number; rising: boolean }
);

type Melody = readonly (readonly [beat: number, note: number, length: number])[];
export const starwakeTheme: Melody = [[0, 69, 1.2], [1.5, 72, .8], [3, 77, 2.2], [6, 76, 1.2],
  [8, 72, 1.4], [10, 74, 2.1], [13, 69, 1.5], [15, 67, .65]];
const melodies: Record<string, Melody> = {
  theme: starwakeTheme,
  answer: [[0, 74, 1.5], [2, 72, 1], [4, 69, 2.3], [7, 67, .7], [8, 70, 1.4], [10, 69, 1], [12, 67, 1.5], [14, 74, 1.2]],
  fragment: [[2, 69, 1.5], [5, 72, 1.2], [11, 77, 2]],
  invitation: [[0, 69, 1.2], [1.5, 72, .8], [3, 77, 2.2], [6, 76, 1.2]],
  travel: [[.5, 72, 1.2], [2.5, 74, .8], [4, 77, 1.8], [7, 74, .65], [8.5, 72, 1.2], [11, 69, 1.5], [14, 67, 1.2]],
  question: [[1, 74, 1.4], [4, 72, 1.6], [7, 70, 1], [10, 69, 1.5], [13, 73, 1.5]],
  orbit: [[0, 69, 1.7], [2, 72, 1.1], [4, 77, 2.4], [7.5, 76, .8], [9, 74, 1.6], [11.5, 72, .8], [13, 69, 2]],
  moving: [[.75, 74, .8], [2.5, 72, 1], [4.5, 69, 1.5], [7.25, 67, .6], [9, 70, 1.2], [11, 69, .9], [13.5, 73, 1.4]],
  suspended: [[1, 74, 2.2], [6, 72, 2], [11, 69, 2.6]],
  beacon: [[.5, 67, 1.5], [4.5, 69, 2], [9, 73, 1.4], [12, 76, 2.2]],
  lift: [[0, 74, 1.4], [2, 72, 1], [4, 69, 2], [7, 72, .8], [8, 77, 2], [11, 76, 1.2], [13, 74, 2]],
  summit: [[0, 69, 1.3], [1.5, 72, .9], [3, 77, 2.2], [6, 76, 1.2], [8, 77, 1.5], [10, 79, 2], [13, 77, 2.2]],
  release: [[0, 77, 2], [3, 76, 1.5], [5.5, 74, 1.8], [8, 72, 2], [11, 69, 1.4], [13, 67, 2]],
  recollection: [[0, 69, 1.8], [2.5, 72, 1.1], [4, 77, 2.6], [8.5, 74, 1.8], [12, 69, 2.7]],
  landing: [[0, 70, 2], [3, 69, 1.8], [6, 67, 2.5], [10, 69, 2], [13, 65, 2.5]],
  coda: [[0, 67, 2.2], [4, 69, 2.6], [8, 72, 2.4], [12, 65, 3.6]],
};

const harmony = {
  F: [41, [53, 57, 72, 79]], Fa: [33, [57, 60, 65, 79]],
  C: [36, [52, 55, 72, 74]], Ce: [40, [55, 60, 64, 74]],
  Cs: [36, [50, 55, 72, 74]], Bb: [34, [53, 57, 72, 74]],
  Bbd: [38, [57, 62, 65, 72]], Dm: [38, [53, 57, 72, 76]],
  Dma: [33, [57, 62, 65, 76]], Gm: [31, [53, 57, 70, 74]],
  Eb: [39, [55, 58, 74, 77]], Em: [40, [55, 58, 74, 76]],
  As: [33, [55, 57, 74, 76]], A7: [33, [55, 57, 73, 76]],
} as const;
type Harmony = keyof typeof harmony;

// Each row owns four bars of harmonic, rhythmic and thematic development.
export const starwakePhrases = [
  ['F F Bb Cs', 0, ''], ['F Fa Bb Cs', 1, 'fragment'],
  ['F C Dm Bb', 2, 'invitation'], ['Gm Cs F A7', 3, 'answer'],
  ['Dm Bbd F Ce', 4, 'travel'], ['Gm Bb As A7', 5, 'question'],
  ['Bb F C Dm', 6, 'theme'], ['Gm Bb Cs C', 3, 'answer'],
  ['F Ce Dm Bbd', 4, 'orbit'], ['Gm Fa Bb Cs', 5, 'travel'],
  ['Dm Bb Gm A7', 7, 'moving'], ['Eb Bb Em A7', 6, 'question'],
  ['Dm Fa Gm Ce', 7, 'travel'], ['Bb Gm As A7', 5, 'moving'],
  ['Dm Dma Gm Gm', 0, 'suspended'], ['Bb Em As A7', 1, 'beacon'],
  ['Bb F C Dm', 6, 'theme'], ['Gm Fa Bb Cs', 4, 'lift'],
  ['F Ce Dm Bbd', 6, 'summit'], ['Gm Bbd Cs C', 3, 'release'],
  ['F C Dm Bb', 2, 'orbit'], ['Gm Fa Bb Cs', 4, 'recollection'],
  ['Dm Bb Gm C', 3, 'landing'], ['Gm Cs F F', 0, 'coda'],
] as const;

// Four bar cells per groove, expressed on the sixteenth grid.
const kicks = [[0], [0, 8], [0, 4, 8], [0, 4, 8, 14], [0, 4, 8, 12],
  [0, 6, 8], [0, 4, 8, 11, 12], [0, 3, 8, 12], [0, 4, 10], [0, 4, 8, 12, 15]];
const grooves = [[0, 0, 1, 1], [1, 2, 1, 3], [2, 3, 4, 5], [4, 6, 9, 8],
  [4, 3, 6, 5], [7, 4, 9, 8], [4, 6, 9, 4], [7, 6, 9, 5]];
const phraseEnds = new Map([[7, 12], [23, 13], [39, 12], [55, 10], [63, 12], [79, 14], [91, 11], [93, 8], [94, 4], [95, 0]]);
const fills = new Set([15, 23, 31, 39, 47, 51, 63, 71, 79, 87]);

function baseScore(): OrbitEvent[] {
  const events: OrbitEvent[] = [];
  let previousVoicing: number[] = [];
  const put = (bar: number, sixteenth: number, voice: OrbitEvent['voice'], velocity: number, detail = {}) => {
    const beat = bar * 4 + sixteenth / 4;
    const section = sections.find(section => bar < section.endBar)!;
    events.push({ voice, bar, beat, at: beat * beatSeconds, velocity, section: section.name,
      accent: voice === 'kick' || voice === 'lead', fill: false, transition: voice === 'sweep', ...detail } as OrbitEvent);
  };
  for (const [phrase, [changes, groove, motif]] of starwakePhrases.entries()) {
    const chords = changes.split(' ') as Harmony[];
    const section = sections.find(section => phrase * 4 < section.endBar)!;
    const aurora = section.name === 'AURORA';
    for (let cell = 0; cell < 4; cell++) {
      const bar = phrase * 4 + cell;
      const [, notes] = harmony[chords[cell]];
      const cutoff = phraseEnds.get(bar) ?? 16;
      let kick = kicks[grooves[groove][cell]];
      let snare = [4, 12];
      let hats = phrase % 3 === 1 && cell === 2 ? [2, 6, 10, 13.5, 14] : [2, 6, 10, 14];
      if (bar < 8) {
        kick = bar < 3 ? [] : bar < 6 ? [0] : [0, 8];
        snare = bar === 7 ? [12] : [];
        hats = bar < 2 ? [] : bar < 5 ? [6, 14] : [2, 6, 10, 14];
      }
      if (bar >= 56 && bar < 64) {
        kick = bar === 56 ? [0, 8] : bar === 59 ? [] : [0];
        snare = bar === 56 ? [12] : [];
        hats = bar < 58 ? [6, 14] : bar > 61 ? [14] : [];
      }
      if (bar >= 88) {
        kick = bar < 90 ? [0, 4, 8, 12] : bar < 92 ? [0, 8] : bar < 95 ? [0] : [];
        snare = bar < 91 ? [4, 12] : [];
        hats = bar < 92 ? [2, 6, 10, 14] : bar < 94 ? [6, 14] : [];
      }
      const eclipse = bar >= 56 && bar < 64;
      const force = eclipse ? (bar === 56 ? .65 : .54) : bar >= 40 && bar < 56 ? .94 : aurora ? .92 : .84;
      for (const hit of kick) if (hit < cutoff) put(bar, hit, 'kick', force * (hit % 4 ? .72 : 1));
      for (const hit of snare) if (hit < cutoff) put(bar, hit, 'snare', force * .85);
      for (const [i, hit] of hats.entries()) if (hit < cutoff) put(bar, hit, 'hat', i % 2 ? .34 : .49,
        { open: cell === 2 && hit === 14, pan: i % 2 ? .30 : -.25 });
      if (bar >= 8 && bar < 88 && (bar < 56 || bar >= 64)) {
        if ((phrase % 2 === 1 && cell === 3) || (groove === 7 && cell === 1)) put(bar, 11, 'snare', .22, { ghost: true });
        if (cell === 1 || cell === 2) put(bar, groove === 7 ? 13.5 : 7, 'perc', .38,
          { note: cell === 1 ? 62 : 57, pan: cell === 1 ? -.45 : .4 });
      }
      if (fills.has(bar)) for (const [i, hit] of [13, 14.5, 15.25].entries()) {
        put(bar, hit, 'snare', .22 + i * .08, { ghost: true, fill: true, transition: true });
      }
      if (cell % 2 === 0 || bar === 95 || (aurora && cell === 3)) {
        // Move individual voices by octaves toward the preceding voicing.
        const voicing = notes.map((note, i) => {
          if (!previousVoicing.length) return note;
          return [note - 12, note, note + 12].filter(pitch => pitch >= 53 && pitch <= 81)
            .sort((a, b) => Math.abs(a - previousVoicing[i]) - Math.abs(b - previousVoicing[i]))[0];
        });
        previousVoicing = voicing;
        put(bar, 0, 'pad', eclipse ? (bar === 56 ? .44 : bar === 62 ? .40 : .36) : .48,
          { notes: voicing, length: (bar === 95 ? 3.5 : aurora && cell >= 2 ? 3.5 : 6.8) * beatSeconds,
            color: aurora ? .82 : bar >= 56 && bar < 64 ? .36 : .52 });
      }

    }
    for (const [i, [beat, note, length]] of (melodies[motif] ?? []).entries()) {
      put(phrase * 4 + Math.floor(beat / 4), beat % 4 * 4, 'lead',
        phrase < 3 ? .55 : section.name === 'ECLIPSE' ? .52 : aurora ? .80 : .65, { note,
          length: length * beatSeconds * (aurora ? 1.12 : 1), pan: .04,
          motif, accent: i === 0 || i === 2 });
    }
  }
  for (const bar of [7, 23, 39, 55, 63, 79, 87]) put(bar, 8, 'sweep', .42,
    { length: 2 * beatSeconds, rising: true });
  for (const bar of [8, 24, 40, 64, 80]) put(bar, 0, 'sweep', .28,
    { length: 1.5 * beatSeconds, rising: false });
  return events.sort((a, b) => a.at - b.at || a.voice.localeCompare(b.voice))
    .map((event, index) => ({ ...event, id: starwakeEventIds[index], identity: `starwake:${starwakeEventIds[index]}` }));
}

const repairs = [
  { beat: 6, theme: 0, velocity: .28 },
  { beat: 9, theme: 1, velocity: .29 },
  { beat: 12, theme: 2, velocity: .30 },
  { beat: 40, theme: 4, velocity: .38 },
  { beat: 44, theme: 6, velocity: .36 },
] as const;

const firstRepairId = 1692; // Reserved above every original event, including removed parts.
export const starwakeRepairs: readonly OrbitEvent[] = repairs.map((repair, index) => {
  const [, note, beats] = starwakeTheme[repair.theme];
  const bar = Math.floor(repair.beat / 4), id = firstRepairId + index;
  return { id, identity: `starwake-m1-f1:repair:${index}`, voice: 'lead',
    bar, beat: repair.beat, at: repair.beat * beatSeconds, velocity: repair.velocity,
    section: starwakeTrack.sections.find(section => bar < section.endBar)!.name,
    accent: false, fill: false, transition: false, pan: .04,
    note, length: beats * beatSeconds, motif: 'original-theme-quotation' };
});

export function makeStarwakeScore(): OrbitEvent[] {
  return [...baseScore(), ...starwakeRepairs].sort((a,b) => a.at-b.at || a.voice.localeCompare(b.voice));
}

export const starwakeEvents = makeStarwakeScore();
const indexedSteps: number[][] = Array.from({ length: starwakeTrack.bars * 16 }, () => []);
for (const [i, event] of starwakeEvents.entries()) indexedSteps[Math.floor(event.beat * 4 + 1e-8)].push(i);
export const starwakeSteps: readonly (readonly number[])[] = indexedSteps;
