const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const GROUPS = {
  small: { targetSize: 14, titleKo: '\uC2A4\uBAB0', titleEn: 'Small' },
  medium: { targetSize: 18, titleKo: '\uBBF8\uB514\uC5C4', titleEn: 'Medium' },
  large: { targetSize: 24, titleKo: '\uB77C\uC9C0', titleEn: 'Large' },
};
const TARGET_PER_GROUP = 50;

const PHOSPHOR_FRIENDLY_POOL = [
  'airplane',
  'ambulance',
  'baby-carriage',
  'baby',
  'backpack',
  'balloon',
  'baseball-cap',
  'baseball-helmet',
  'baseball',
  'basket',
  'basketball',
  'beach-ball',
  'beer-bottle',
  'beer-stein',
  'bell-ringing',
  'bell',
  'bird',
  'book',
  'books',
  'bowl-food',
  'bowling-ball',
  'bug-beetle',
  'bug-droid',
  'bug',
  'bus',
  'cable-car',
  'cake',
  'call-bell',
  'camera',
  'car',
  'cardholder',
  'carrot',
  'castle-turret',
  'cat',
  'chef-hat',
  'clock',
  'cloud-fog',
  'cloud-lightning',
  'cloud-moon',
  'cloud-rain',
  'cloud-snow',
  'cloud-sun',
  'cloud',
  'coffee-bean',
  'coffee',
  'cookie',
  'cowboy-hat',
  'crown-cross',
  'crown-simple',
  'crown',
  'disco-ball',
  'dog',
  'eyeglasses',
  'fish-simple',
  'fish',
  'flower-lotus',
  'flower-tulip',
  'flower',
  'football-helmet',
  'football',
  'game-controller',
  'ghost',
  'gift',
  'golf',
  'guitar',
  'hamburger',
  'hand-heart',
  'hard-hat',
  'heart',
  'heartbeat',
  'hockey',
  'house',
  'ice-cream',
  'key',
  'leaf',
  'lego-smiley',
  'lighthouse',
  'lock-laminated-open',
  'lock-laminated',
  'lock-open',
  'lock-simple-open',
  'lock-simple',
  'lock',
  'medal-military',
  'medal',
  'microphone-stage',
  'microphone',
  'moon-stars',
  'moon',
  'music-note-simple',
  'music-note',
  'music-notes-simple',
  'music-notes',
  'notebook',
  'notification',
];

const GROUP_PRIORITY_NAMES = {
  small: [
    'heart',
    'gift',
    'balloon',
    'bell',
    'bell-ringing',
    'bird',
    'cat',
    'dog',
    'fish',
    'ghost',
    'lego-smiley',
    'cookie',
    'cake',
    'ice-cream',
    'flower',
    'flower-tulip',
    'flower-lotus',
    'leaf',
    'cloud',
    'cloud-sun',
    'cloud-rain',
    'cloud-snow',
    'cloud-moon',
    'moon',
    'moon-stars',
    'camera',
    'key',
    'lock-simple',
    'crown',
    'music-note',
    'music-notes',
    'baby',
    'bug',
    'bug-beetle',
    'book',
    'coffee',
    'carrot',
    'hamburger',
    'hand-heart',
    'house',
  ],
  medium: [
    'cat',
    'dog',
    'bird',
    'fish',
    'ghost',
    'gift',
    'camera',
    'house',
    'backpack',
    'book',
    'books',
    'cake',
    'cookie',
    'hamburger',
    'coffee',
    'bowl-food',
    'chef-hat',
    'guitar',
    'microphone',
    'game-controller',
    'baseball',
    'basketball',
    'football',
    'hockey',
    'eyeglasses',
    'bell',
    'cloud',
    'cloud-sun',
    'cloud-rain',
    'moon-stars',
    'flower',
    'flower-tulip',
    'leaf',
    'car',
    'bus',
    'airplane',
    'cable-car',
    'castle-turret',
    'lighthouse',
    'medal',
  ],
  large: [
    'airplane',
    'ambulance',
    'bus',
    'car',
    'cable-car',
    'castle-turret',
    'house',
    'lighthouse',
    'backpack',
    'baby-carriage',
    'camera',
    'book',
    'books',
    'game-controller',
    'guitar',
    'microphone-stage',
    'football-helmet',
    'football',
    'baseball-helmet',
    'baseball',
    'basketball',
    'beach-ball',
    'bowling-ball',
    'golf',
    'hockey',
    'chef-hat',
    'bowl-food',
    'hamburger',
    'coffee',
    'gift',
    'ghost',
    'cat',
    'dog',
    'bird',
    'fish-simple',
    'flower-lotus',
    'flower',
    'cloud-lightning',
    'cloud-rain',
    'moon-stars',
  ],
};

const HEROICONS_FRIENDLY_POOL = [
  ['heart', '\uD558\uD2B8', 'Heart'],
  ['bell', '\uC885', 'Bell'],
  ['fire', '\uBD88', 'Fire'],
  ['sun', '\uD574', 'Sun'],
  ['moon', '\uB2EC', 'Moon'],
  ['key', '\uC5F4\uC1E0', 'Key'],
  ['bug-ant', '\uAC1C\uBBF8', 'Ant'],
  ['ticket', '\uD2F0\uCF13', 'Ticket'],
  ['musical-note', '\uC74C\uD45C', 'Note'],
  ['cloud', '\uAD6C\uB984', 'Cloud'],
  ['bolt', '\uBC88\uAC1C', 'Bolt'],
  ['sparkles', '\uBC18\uC9DD\uC784', 'Sparkles'],
  ['gift', '\uC120\uBB3C', 'Gift'],
  ['cake', '\uCF00\uC774\uD06C', 'Cake'],
  ['camera', '\uCE74\uBA54\uB77C', 'Camera'],
  ['light-bulb', '\uC804\uAD6C', 'Light Bulb'],
  ['envelope', '\uD3B8\uC9C0', 'Envelope'],
  ['bookmark', '\uBD81\uB9C8\uD06C', 'Bookmark'],
  ['map-pin', '\uD540', 'Map Pin'],
  ['hand-thumb-up', '\uC88B\uC544\uC694', 'Thumb Up'],
  ['microphone', '\uB9C8\uC774\uD06C', 'Microphone'],
  ['shield-check', '\uBC29\uD328', 'Shield'],
  ['chat-bubble-left', '\uB9D0\uD48D\uC120', 'Chat Bubble'],
  ['check-badge', '\uBC30\uC9C0', 'Badge'],
  ['home', '\uC9D1', 'House'],
  ['gift-top', '\uC120\uBB3C\uC0C1\uC790', 'Gift Box'],
  ['shopping-bag', '\uC1FC\uD551\uBC31', 'Shopping Bag'],
  ['photo', '\uC0AC\uC9C4', 'Photo'],
  ['puzzle-piece', '\uD37C\uC990', 'Puzzle Piece'],
  ['paint-brush', '\uBD93', 'Brush'],
  ['paper-airplane', '\uBE44\uD589\uAE30', 'Paper Airplane'],
  ['truck', '\uD2B8\uB7ED', 'Truck'],
  ['film', '\uC601\uD654', 'Film'],
  ['book-open', '\uCC45', 'Book'],
  ['globe-alt', '\uC9C0\uAD6C', 'Globe'],
  ['lifebuoy', '\uAD6C\uBA85\uD29C\uBE0C', 'Lifebuoy'],
  ['map', '\uC9C0\uB3C4', 'Map'],
  ['clock', '\uC2DC\uACC4', 'Clock'],
  ['building-storefront', '\uC0C1\uC810', 'Store'],
  ['wallet', '\uC9C0\uAC11', 'Wallet'],
  ['user-circle', '\uC0AC\uC6A9\uC790', 'User Circle'],
  ['rocket-launch', '\uB85C\uCF13', 'Rocket'],
  ['building-library', '\uB3C4\uC11C\uAD00', 'Library'],
  ['trophy', '\uD2B8\uB85C\uD53C', 'Trophy'],
];

const SPECIAL_TITLE_KO_MAP = {
  airplane: '\uBE44\uD589\uAE30',
  ambulance: '\uAD6C\uAE09\uCC28',
  'baby-carriage': '\uC720\uBAA8\uCC28',
  baby: '\uC544\uAE30',
  backpack: '\uBC30\uB0AD',
  balloon: '\uD48D\uC120',
  'baseball-cap': '\uC57C\uAD6C \uBAA8\uC790',
  'baseball-helmet': '\uC57C\uAD6C \uD5EC\uBA67',
  baseball: '\uC57C\uAD6C\uACF5',
  basket: '\uBC14\uAD6C\uB2C8',
  basketball: '\uB18D\uAD6C\uACF5',
  'beach-ball': '\uBE44\uCE58\uBCFC',
  'beer-bottle': '\uB9E5\uC8FC\uBCD1',
  'beer-stein': '\uB9E5\uC8FC\uC794',
  'bell-ringing': '\uC6B8\uB9AC\uB294 \uC885',
  bell: '\uC885',
  bird: '\uC0C8',
  book: '\uCC45',
  books: '\uCC45\uB354\uBBF8',
  'bowl-food': '\uC74C\uC2DD \uADF8\uB987',
  'bowling-ball': '\uBCFC\uB9C1\uACF5',
  'bug-beetle': '\uB531\uC815\uBC8C\uB808',
  'bug-droid': '\uB85C\uBD07 \uBC8C\uB808',
  bug: '\uBC8C\uB808',
  bus: '\uBC84\uC2A4',
  'cable-car': '\uCF00\uC774\uBE14\uCE74',
  cake: '\uCF00\uC774\uD06C',
  'call-bell': '\uD638\uCD9C \uBCA8',
  camera: '\uCE74\uBA54\uB77C',
  car: '\uC790\uB3D9\uCC28',
  cardholder: '\uCE74\uB4DC \uC9C0\uAC11',
  carrot: '\uB2F9\uADFC',
  'castle-turret': '\uC131\uD0D1',
  cat: '\uACE0\uC591\uC774',
  'chef-hat': '\uC170\uD504 \uBAA8\uC790',
  clock: '\uC2DC\uACC4',
  'cloud-fog': '\uC548\uAC1C \uAD6C\uB984',
  'cloud-lightning': '\uBC88\uAC1C \uAD6C\uB984',
  'cloud-moon': '\uB2EC \uAD6C\uB984',
  'cloud-rain': '\uBE44 \uAD6C\uB984',
  'cloud-snow': '\uB208 \uAD6C\uB984',
  'cloud-sun': '\uD574 \uAD6C\uB984',
  cloud: '\uAD6C\uB984',
  'coffee-bean': '\uCEE4\uD53C\uCF69',
  coffee: '\uCEE4\uD53C',
  cookie: '\uCFE0\uD0A4',
  'cowboy-hat': '\uCE74\uC6B0\uBCF4\uC774 \uBAA8\uC790',
  'crown-cross': '\uC7A5\uC2DD \uC655\uAD00',
  'crown-simple': '\uC2EC\uD50C \uC655\uAD00',
  crown: '\uC655\uAD00',
  'disco-ball': '\uB514\uC2A4\uCF54\uBCFC',
  dog: '\uAC15\uC544\uC9C0',
  eyeglasses: '\uC548\uACBD',
  'fish-simple': '\uC791\uC740 \uBB3C\uACE0\uAE30',
  fish: '\uBB3C\uACE0\uAE30',
  'flower-lotus': '\uC5F0\uAF43',
  'flower-tulip': '\uD280\uB9BD',
  flower: '\uAF43',
  'football-helmet': '\uD48B\uBCFC \uD5EC\uBA67',
  football: '\uBBF8\uC2DD\uCD95\uAD6C\uACF5',
  'game-controller': '\uAC8C\uC784 \uD328\uB4DC',
  ghost: '\uC720\uB839',
  gift: '\uC120\uBB3C',
  golf: '\uACE8\uD504\uACF5',
  guitar: '\uAE30\uD0C0',
  hamburger: '\uD584\uBC84\uAC70',
  'hand-heart': '\uD558\uD2B8 \uC190',
  'hard-hat': '\uC548\uC804\uBAA8',
  heart: '\uD558\uD2B8',
  heartbeat: '\uC2EC\uC7A5\uBC15\uB3D9',
  hockey: '\uD558\uD0A4',
  house: '\uC9D1',
  'ice-cream': '\uC544\uC774\uC2A4\uD06C\uB9BC',
  key: '\uC5F4\uC1E0',
  leaf: '\uC78E\uC0AC\uADC0',
  'lego-smiley': '\uB808\uACE0 \uC2A4\uB9C8\uC77C',
  lighthouse: '\uB4F1\uB300',
  'lock-laminated-open': '\uC5F4\uB9B0 \uC790\uBB3C\uC1E0',
  'lock-laminated': '\uC790\uBB3C\uC1E0',
  'lock-open': '\uC5F4\uB9B0 \uC790\uBB3C\uC1E0',
  'lock-simple-open': '\uC5F4\uB9B0 \uC790\uBB3C\uC1E0',
  'lock-simple': '\uC790\uBB3C\uC1E0',
  lock: '\uC790\uBB3C\uC1E0',
  'medal-military': '\uAD70\uC6A9 \uBA54\uB2EC',
  medal: '\uBA54\uB2EC',
  'microphone-stage': '\uACF5\uC5F0 \uB9C8\uC774\uD06C',
  microphone: '\uB9C8\uC774\uD06C',
  'moon-stars': '\uBCC4 \uB2EC',
  moon: '\uB2EC',
  'music-note-simple': '\uC74C\uD45C',
  'music-note': '\uC74C\uD45C',
  'music-notes-simple': '\uC74C\uD45C\uB4E4',
  'music-notes': '\uC74C\uD45C\uB4E4',
  notebook: '\uB178\uD2B8',
  notification: '\uC54C\uB9BC',
};

const TOKEN_KO_MAP = {
  airplane: '\uBE44\uD589\uAE30',
  ambulance: '\uAD6C\uAE09\uCC28',
  baby: '\uC544\uAE30',
  carriage: '\uC720\uBAA8\uCC28',
  backpack: '\uBC30\uB0AD',
  balloon: '\uD48D\uC120',
  baseball: '\uC57C\uAD6C',
  cap: '\uBAA8\uC790',
  helmet: '\uD5EC\uBA67',
  basket: '\uBC14\uAD6C\uB2C8',
  basketball: '\uB18D\uAD6C\uACF5',
  beach: '\uBE44\uCE58',
  ball: '\uACF5',
  beer: '\uB9E5\uC8FC',
  bottle: '\uBCD1',
  stein: '\uC794',
  bell: '\uC885',
  ringing: '\uC6B8\uB9AC\uB294',
  bird: '\uC0C8',
  book: '\uCC45',
  books: '\uCC45\uB354\uBBF8',
  bowl: '\uADF8\uB987',
  food: '\uC74C\uC2DD',
  bowling: '\uBCFC\uB9C1',
  bug: '\uBC8C\uB808',
  beetle: '\uB531\uC815\uBC8C\uB808',
  droid: '\uB85C\uBD07',
  bus: '\uBC84\uC2A4',
  cable: '\uCF00\uC774\uBE14',
  car: '\uC790\uB3D9\uCC28',
  call: '\uD638\uCD9C',
  camera: '\uCE74\uBA54\uB77C',
  carrot: '\uB2F9\uADFC',
  castle: '\uC131',
  turret: '\uD0D1',
  cat: '\uACE0\uC591\uC774',
  chef: '\uC170\uD504',
  hat: '\uBAA8\uC790',
  clock: '\uC2DC\uACC4',
  cloud: '\uAD6C\uB984',
  fog: '\uC548\uAC1C',
  lightning: '\uBC88\uAC1C',
  moon: '\uB2EC',
  rain: '\uBE44',
  snow: '\uB208',
  sun: '\uD574',
  coffee: '\uCEE4\uD53C',
  bean: '\uCF69',
  cookie: '\uCFE0\uD0A4',
  cowboy: '\uCE74\uC6B0\uBCF4\uC774',
  crown: '\uC655\uAD00',
  cross: '\uC7A5\uC2DD',
  simple: '\uC2EC\uD50C',
  disco: '\uB514\uC2A4\uCF54',
  dog: '\uAC15\uC544\uC9C0',
  eyeglasses: '\uC548\uACBD',
  fish: '\uBB3C\uACE0\uAE30',
  flower: '\uAF43',
  lotus: '\uC5F0\uAF43',
  tulip: '\uD280\uB9BD',
  football: '\uD48B\uBCFC',
  game: '\uAC8C\uC784',
  controller: '\uD328\uB4DC',
  ghost: '\uC720\uB839',
  gift: '\uC120\uBB3C',
  golf: '\uACE8\uD504',
  guitar: '\uAE30\uD0C0',
  hamburger: '\uD584\uBC84\uAC70',
  hand: '\uC190',
  heart: '\uD558\uD2B8',
  heartbeat: '\uC2EC\uC7A5\uBC15\uB3D9',
  hard: '\uC548\uC804',
  hockey: '\uD558\uD0A4',
  house: '\uC9D1',
  ice: '\uC544\uC774\uC2A4',
  cream: '\uD06C\uB9BC',
  key: '\uC5F4\uC1E0',
  leaf: '\uC78E\uC0AC\uADC0',
  lego: '\uB808\uACE0',
  smiley: '\uC2A4\uB9C8\uC77C',
  lighthouse: '\uB4F1\uB300',
  lock: '\uC790\uBB3C\uC1E0',
  laminated: '\uB77C\uBBF8\uB124\uC774\uD2B8',
  open: '\uC5F4\uB9B0',
  medal: '\uBA54\uB2EC',
  military: '\uAD70\uC6A9',
  microphone: '\uB9C8\uC774\uD06C',
  stage: '\uBB34\uB300',
  music: '\uC74C\uC545',
  note: '\uC74C\uD45C',
  notes: '\uC74C\uD45C\uB4E4',
  notebook: '\uB178\uD2B8',
  notification: '\uC54C\uB9BC',
};

function humanizeIconName(name) {
  return String(name || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function guessKoreanTitle(name) {
  if (SPECIAL_TITLE_KO_MAP[name]) return SPECIAL_TITLE_KO_MAP[name];
  const tokens = String(name || '').split('-').filter(Boolean);
  const translated = tokens.map((token) => TOKEN_KO_MAP[token]).filter(Boolean);
  if (translated.length === tokens.length && translated.length) {
    return translated.join(' ');
  }
  return humanizeIconName(name);
}

function buildIconCandidate(sizeGroup, name, options = {}) {
  const sourcePack = options.sourcePack || 'phosphor';
  const titleKo = options.titleKo || guessKoreanTitle(name);
  const titleEn = options.titleEn || humanizeIconName(name);
  const sourceUrl =
    sourcePack === 'hero'
      ? `https://raw.githubusercontent.com/tailwindlabs/heroicons/master/src/24/solid/${name}.svg`
      : `https://raw.githubusercontent.com/phosphor-icons/core/main/assets/regular/${name}.svg`;
  return {
    id: `${sourcePack}-${sizeGroup}-${name}`,
    sourceName: name,
    titleKo,
    titleEn,
    sizeGroup,
    groupTitleKo: GROUPS[sizeGroup].titleKo,
    groupTitleEn: GROUPS[sizeGroup].titleEn,
    license: 'MIT',
    targetSize: GROUPS[sizeGroup].targetSize,
    sourceUrl,
  };
}

function uniqueNames(names) {
  return [...new Set(names.filter(Boolean))];
}

async function buildIconCandidates() {
  return Object.keys(GROUPS).flatMap((groupKey) => {
    const phosphorCandidates = uniqueNames([
      ...GROUP_PRIORITY_NAMES[groupKey],
      ...PHOSPHOR_FRIENDLY_POOL,
    ]).map((name) => buildIconCandidate(groupKey, name, { sourcePack: 'phosphor' }));
    const heroCandidates = HEROICONS_FRIENDLY_POOL.map(([name, titleKo, titleEn]) =>
      buildIconCandidate(groupKey, name, { sourcePack: 'hero', titleKo, titleEn })
    );
    return [...phosphorCandidates, ...heroCandidates];
  });
}

function formatJsString(value) {
  return JSON.stringify(value).replace(/[<>\u007f-\uffff]/g, (char) => {
    if (char === '<') return '\\u003c';
    if (char === '>') return '\\u003e';
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
}

function rowsToJs(rows) {
  return `[\n${rows.map((row) => `      ${formatJsString(row)}`).join(',\n')}\n    ]`;
}

const linePatternCache = new Map();

function getRunsFromRowString(row) {
  const runs = [];
  let count = 0;
  for (const ch of row) {
    if (ch === '#') count += 1;
    else if (count > 0) {
      runs.push(count);
      count = 0;
    }
  }
  if (count > 0) runs.push(count);
  return runs;
}

function buildCluesFromRows(rows) {
  const height = rows.length;
  const width = rows[0]?.length || 0;
  const rowClues = rows.map((row) => getRunsFromRowString(row));
  const colClues = Array.from({ length: width }, (_, x) => {
    let line = '';
    for (let y = 0; y < height; y += 1) line += rows[y][x];
    return getRunsFromRowString(line);
  });
  return { rowClues, colClues };
}

function getLinePatterns(length, clues) {
  const key = `${length}|${clues.join(',')}`;
  if (linePatternCache.has(key)) return linePatternCache.get(key);

  const patterns = [];
  if (!clues.length) {
    const pattern = new Array(length).fill(0);
    patterns.push(pattern);
    linePatternCache.set(key, patterns);
    return patterns;
  }

  function place(clueIndex, position, line) {
    if (clueIndex >= clues.length) {
      for (let i = position; i < length; i += 1) line[i] = 0;
      patterns.push(line.slice());
      return;
    }

    const remainingRuns = clues.slice(clueIndex);
    const remainingFilled = remainingRuns.reduce((sum, clue) => sum + clue, 0);
    const remainingGaps = remainingRuns.length - 1;
    const maxStart = length - (remainingFilled + remainingGaps);
    for (let start = position; start <= maxStart; start += 1) {
      const next = line.slice();
      for (let i = position; i < start; i += 1) next[i] = 0;
      for (let i = 0; i < clues[clueIndex]; i += 1) next[start + i] = 1;
      const nextPos = start + clues[clueIndex];
      if (clueIndex < clues.length - 1) {
        next[nextPos] = 0;
        place(clueIndex + 1, nextPos + 1, next);
      } else {
        place(clueIndex + 1, nextPos, next);
      }
    }
  }

  place(0, 0, new Array(length).fill(0));
  linePatternCache.set(key, patterns);
  return patterns;
}

function patternMatchesLine(pattern, line) {
  for (let i = 0; i < line.length; i += 1) {
    const cell = line[i];
    if (cell !== -1 && cell !== pattern[i]) return false;
  }
  return true;
}

function transposeGrid(grid, width, height) {
  return Array.from({ length: width }, (_, x) =>
    Array.from({ length: height }, (_, y) => grid[y * width + x])
  );
}

function logicalSolvePuzzle(width, height, rowClues, colClues, initialGrid = null) {
  const grid = initialGrid ? initialGrid.slice() : new Array(width * height).fill(-1);
  let changed = true;

  while (changed) {
    changed = false;

    for (let y = 0; y < height; y += 1) {
      const line = grid.slice(y * width, (y + 1) * width);
      const validPatterns = getLinePatterns(width, rowClues[y]).filter((pattern) => patternMatchesLine(pattern, line));
      if (!validPatterns.length) return { valid: false, solved: false, grid };
      for (let x = 0; x < width; x += 1) {
        const value = validPatterns[0][x];
        if (validPatterns.every((pattern) => pattern[x] === value) && grid[y * width + x] !== value) {
          grid[y * width + x] = value;
          changed = true;
        }
      }
    }

    const cols = transposeGrid(grid, width, height);
    for (let x = 0; x < width; x += 1) {
      const line = cols[x];
      const validPatterns = getLinePatterns(height, colClues[x]).filter((pattern) => patternMatchesLine(pattern, line));
      if (!validPatterns.length) return { valid: false, solved: false, grid };
      for (let y = 0; y < height; y += 1) {
        const value = validPatterns[0][y];
        if (validPatterns.every((pattern) => pattern[y] === value) && grid[y * width + x] !== value) {
          grid[y * width + x] = value;
          changed = true;
        }
      }
    }
  }

  return { valid: true, solved: grid.every((cell) => cell !== -1), grid };
}

function countPuzzleSolutions(width, height, rowClues, colClues, initialGrid = null, limit = 2) {
  const state = logicalSolvePuzzle(width, height, rowClues, colClues, initialGrid);
  if (!state.valid) return 0;
  if (state.solved) return 1;

  const pivot = state.grid.findIndex((cell) => cell === -1);
  if (pivot < 0) return 1;

  let solutions = 0;
  for (const guess of [1, 0]) {
    const nextGrid = state.grid.slice();
    nextGrid[pivot] = guess;
    solutions += countPuzzleSolutions(width, height, rowClues, colClues, nextGrid, limit - solutions);
    if (solutions >= limit) return limit;
  }
  return solutions;
}

function analyzePuzzle(rows) {
  const height = rows.length;
  const width = rows[0]?.length || 0;
  const { rowClues, colClues } = buildCluesFromRows(rows);
  const logical = logicalSolvePuzzle(width, height, rowClues, colClues);
  if (!logical.valid) {
    return {
      rowClues,
      colClues,
      unique: false,
      needsGuess: true,
      logicalSolved: false,
      solutionCount: 0,
    };
  }
  if (!logical.solved) {
    return {
      rowClues,
      colClues,
      unique: false,
      needsGuess: true,
      logicalSolved: false,
      solutionCount: 0,
    };
  }
  const solutionCount = countPuzzleSolutions(width, height, rowClues, colClues, logical.grid, 2);
  return {
    rowClues,
    colClues,
    unique: solutionCount === 1,
    needsGuess: !logical.solved,
    logicalSolved: logical.solved,
    solutionCount,
  };
}

async function renderIconRows(page, svgText, targetSize = 14) {
  return page.evaluate(async ({ svgText, targetSize }) => {
    function waitForImage(img) {
      return new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (error) => reject(error || new Error('Image load failed'));
      });
    }

    const normalizedSvg = svgText
      .replace(/currentColor/g, '#000000')
      .replace(/stroke="none"/g, '')
      .replace(/fill="none"/g, 'fill="#000000"');

    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(normalizedSvg)}`;
    const img = new Image();
    img.src = dataUrl;
    await waitForImage(img);

    const renderSize = 420;
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = renderSize;
    baseCanvas.height = renderSize;
    const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
    baseCtx.fillStyle = '#ffffff';
    baseCtx.fillRect(0, 0, renderSize, renderSize);

    const pad = 36;
    const scale = Math.min((renderSize - pad * 2) / img.width, (renderSize - pad * 2) / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (renderSize - dw) / 2;
    const dy = (renderSize - dh) / 2;
    baseCtx.drawImage(img, dx, dy, dw, dh);

    const imageData = baseCtx.getImageData(0, 0, renderSize, renderSize).data;
    let minX = renderSize;
    let minY = renderSize;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < renderSize; y += 1) {
      for (let x = 0; x < renderSize; x += 1) {
        const idx = (y * renderSize + x) * 4;
        const alpha = imageData[idx + 3];
        const luminance = (imageData[idx] + imageData[idx + 1] + imageData[idx + 2]) / 3;
        if (alpha > 20 && luminance < 245) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) return [];

    const margin = Math.max(8, Math.round(targetSize * 0.5));
    minX = Math.max(0, minX - margin);
    minY = Math.max(0, minY - margin);
    maxX = Math.min(renderSize - 1, maxX + margin);
    maxY = Math.min(renderSize - 1, maxY + margin);

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = targetSize;
    sampleCanvas.height = targetSize;
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    sampleCtx.fillStyle = '#ffffff';
    sampleCtx.fillRect(0, 0, targetSize, targetSize);
    sampleCtx.imageSmoothingEnabled = true;

    const fitScale = Math.min(targetSize / cropW, targetSize / cropH);
    const fitW = cropW * fitScale;
    const fitH = cropH * fitScale;
    const fitX = (targetSize - fitW) / 2;
    const fitY = (targetSize - fitH) / 2;
    sampleCtx.drawImage(baseCanvas, minX, minY, cropW, cropH, fitX, fitY, fitW, fitH);

    const sampleData = sampleCtx.getImageData(0, 0, targetSize, targetSize).data;
    const rows = [];
    const threshold = targetSize >= 24 ? 228 : targetSize >= 18 ? 220 : 215;
    for (let y = 0; y < targetSize; y += 1) {
      let row = '';
      for (let x = 0; x < targetSize; x += 1) {
        const idx = (y * targetSize + x) * 4;
        const luminance = (sampleData[idx] + sampleData[idx + 1] + sampleData[idx + 2]) / 3;
        row += luminance < threshold ? '#' : '.';
      }
      rows.push(row);
    }

    const nonEmptyRows = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.includes('#'))
      .map(({ index }) => index);
    if (!nonEmptyRows.length) return [];

    const top = nonEmptyRows[0];
    const bottom = nonEmptyRows[nonEmptyRows.length - 1];
    let left = targetSize;
    let right = -1;
    for (let y = top; y <= bottom; y += 1) {
      for (let x = 0; x < targetSize; x += 1) {
        if (rows[y][x] === '#') {
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }

    return rows.slice(top, bottom + 1).map((row) => row.slice(left, right + 1));
  }, { svgText, targetSize });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body style="margin:0;background:#fff"></body></html>');

  const icons = await buildIconCandidates();
  const samples = [];
  const acceptedCounts = Object.fromEntries(Object.keys(GROUPS).map((groupKey) => [groupKey, 0]));
  for (const icon of icons) {
    if (acceptedCounts[icon.sizeGroup] >= TARGET_PER_GROUP) continue;
    const res = await fetch(icon.sourceUrl);
    if (!res.ok) {
      console.log(icon.id, icon.sizeGroup, `SKIP fetch=${res.status}`);
      continue;
    }
    const svgText = await res.text();
    const rows = await renderIconRows(page, svgText, icon.targetSize || 14);
    if (!rows.length) {
      console.log(icon.id, icon.sizeGroup, 'SKIP empty');
      continue;
    }
    const analysis = analyzePuzzle(rows);
    if (analysis.unique && !analysis.needsGuess) {
      samples.push({ ...icon, rows, ...analysis });
      acceptedCounts[icon.sizeGroup] += 1;
      console.log(icon.id, icon.sizeGroup, `${rows[0]?.length || 0}x${rows.length}`, 'PASS');
      if (Object.values(acceptedCounts).every((count) => count >= TARGET_PER_GROUP)) break;
    } else {
      console.log(
        icon.id,
        icon.sizeGroup,
        `${rows[0]?.length || 0}x${rows.length}`,
        `SKIP unique=${analysis.unique} logicalSolved=${analysis.logicalSolved} solutions=${analysis.solutionCount}`
      );
    }
  }

  await browser.close();

  const countsByGroup = samples.reduce((acc, sample) => {
    acc[sample.sizeGroup] = (acc[sample.sizeGroup] || 0) + 1;
    return acc;
  }, {});
  console.log('accepted', samples.length, countsByGroup);

  const finalSamples = Object.keys(GROUPS).flatMap((groupKey) =>
    samples.filter((sample) => sample.sizeGroup === groupKey).slice(0, TARGET_PER_GROUP)
  );
  const finalCountsByGroup = finalSamples.reduce((acc, sample) => {
    acc[sample.sizeGroup] = (acc[sample.sizeGroup] || 0) + 1;
    return acc;
  }, {});
  console.log('final', finalSamples.length, finalCountsByGroup);

  const output = `// Auto-generated from official MIT icon sources.
export const GENERATED_CREATOR_SAMPLE_PUZZLES = [
${finalSamples.map((sample) => `  {
    id: ${formatJsString(sample.id)},
    titleKo: ${formatJsString(sample.titleKo)},
    titleEn: ${formatJsString(sample.titleEn)},
    sizeGroup: ${formatJsString(sample.sizeGroup)},
    groupTitleKo: ${formatJsString(sample.groupTitleKo)},
    groupTitleEn: ${formatJsString(sample.groupTitleEn)},
    license: ${formatJsString(sample.license)},
    targetSize: ${sample.targetSize || 14},
    sourceUrl: ${formatJsString(sample.sourceUrl)},
    unique: ${sample.unique},
    needsGuess: ${sample.needsGuess},
    width: ${sample.rows[0]?.length || 0},
    height: ${sample.rows.length},
    rows: ${rowsToJs(sample.rows)},
  }`).join(',\n')}
];
`;

  const outputPath = path.resolve('./frontend/src/creatorSamples.generated.js');
  fs.writeFileSync(outputPath, output, 'utf8');
  console.log('Wrote', outputPath);
  const jsonOutputPath = path.resolve('./creator-samples.generated.json');
  fs.writeFileSync(jsonOutputPath, JSON.stringify(finalSamples, null, 2), 'utf8');
  console.log('Wrote', jsonOutputPath);
})();
