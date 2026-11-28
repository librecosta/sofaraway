import type { Difficulty, ExperienceMode, OrientationPreference, PauseReason, PlayerMessage, QualityTier, RunResult } from '../game/contracts';
import type { RouteKind } from '../game/core/branches';

export const locales = ['zh-CN', 'en'] as const;
export type Locale = typeof locales[number];

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'zh-CN';
}

export function defaultLocaleFor(region: 'intl' | 'cn', target: 'web' | 'bilibili'): Locale {
  return region === 'cn' || target === 'bilibili' ? 'zh-CN' : 'en';
}

const en = {
  credits: 'CREDITS', share: 'SHARE', settings: 'SETTINGS', close: 'CLOSE',
  creditsDialog: 'Credits', settingsDialog: 'Settings', orientationLabel: 'ORIENTATION', pauseAction: 'Pause',
  proceduralRunner: 'PROCEDURAL RUNNER', tagline: 'MUSIC IN MOTION',
  noScript: 'Enable JavaScript and use a WebGL2-capable browser to play.',
  canvasLabel: 'SoFarAway game viewport', volumeSelector: 'Volume selector',
  previousVolume: 'Previous volume', nextVolume: 'Next volume',
  previousOption: 'Previous {option}', nextOption: 'Next {option}',
  playMode: 'Play mode', difficulty: 'Difficulty', showcaseRoute: 'Showcase route',
  standard: 'STANDARD', sightseeing: 'SIGHTSEEING', showcase: 'SHOWCASE',
  easy: 'EASY', normal: 'NORMAL', hard: 'HARD', impossible: 'IMPOSSIBLE',
  routeMain: 'MAIN', routeChallenge: 'CHALLENGE', routeBonus: 'BONUS', resultRoute: '{route} ROUTE',
  showcaseDetail: 'AUTO PILOT · IMPOSSIBLE COURSE · NO SCORE',
  sightseeingDetail: '{count} LIVES · ⅓ SPEED', oneLife: '{count} LIFE', lives: '{count} LIVES',
  livesRemaining: '{remaining} of {total} lives remaining',
  localRecords: 'Local records', bestScore: 'BEST SCORE', lastVisit: 'LAST VISIT', lastRun: 'LAST RUN',
  recovery: 'RECOVERY', recoveredGates: '{count} RECOVERY', bestIneligible: 'BEST INELIGIBLE',
  initializing: 'INITIALIZING', starting: 'STARTING', start: 'START · PRESS X', startShowcase: 'START SHOWCASE',
  fullScreen: 'FULL SCREEN', exitFullScreen: 'EXIT FULL SCREEN',
  quality: 'QUALITY', qualityGroup: 'Quality', high: 'HIGH', auto: 'AUTO', low: 'LOW', volume: 'VOLUME', mute: 'MUTE',
  language: 'Language', dynamicLights: 'DYNAMIC LIGHTS',
  reducedLights: 'Beat effects paused by your system’s Reduced Motion setting.',
  lightsHelp: 'Corridor lights dim between beats and peak on drums.',
  immersiveMouse: 'IMMERSIVE MOUSE',
  immersiveHelp: 'Capture the mouse during flight. Press Esc to release the mouse and pause.',
  orientation: 'Orientation', landscape: 'LANDSCAPE', portrait: 'PORTRAIT',
  fullscreen: 'FULLSCREEN', enterFullscreen: 'ENTER FULLSCREEN', exitFullscreen: 'EXIT FULLSCREEN',
  fullscreenUnavailable: 'Fullscreen unavailable.', fullscreenUnavailableNotice: 'FULL SCREEN UNAVAILABLE',
  autoBoost: 'AUTO BOOST', autoBoostHelp: 'Maintain Boost throughout Standard flights without holding a button.',
  autoBoostLocked: 'Auto Boost is locked for this flight. Return to the menu to change it.',
  controls: 'CONTROLS',
  steerHelp: 'Move the mouse, drag on the screen, or use the arrow keys or WASD to steer.',
  boostHelp: 'Hold Shift or the left mouse button to Boost. On touch, enable Auto Boost in Settings for continuous Boost.',
  shortcutsHelp: 'X starts or retries. P pauses or resumes. M mutes. Esc goes back.',
  score: 'SCORE', sector: 'SECTOR', gates: 'GATES', velocity: 'VELOCITY', link: 'LINK',
  shieldStatus: 'SHIELD ×{count}', resonance: 'RESONANCE ×{count}',
  enteringRoute: 'Entering {route} route.',
  routeHint: 'Steer left for {left}, straight for {main}, or right for {right}.',
  holdBoost: 'HOLD SHIFT TO BOOST', moveSteer: 'MOVE TO STEER', touchSteer: 'DRAG TO STEER', boost: 'BOOST',
  restoreSound: 'SOUND OFF · RESTORE AUDIO', pause: 'PAUSE', resume: 'RESUME', tryAgain: 'TRY AGAIN',
  playSilent: 'PLAY WITH SOUND OFF', menu: 'BACK TO MENU', replay: 'REPLAY', runAgain: 'RUN AGAIN · PRESS X',
  escaped: 'ESCAPED', terminated: 'TERMINATED', showcaseComplete: 'SHOWCASE COMPLETE',
  showcaseInterrupted: 'SHOWCASE INTERRUPTED', mainScore: 'MAIN SCORE', newBest: 'NEW BEST',
  maxLink: 'MAX LINK', accuracy: 'ACCURACY', encore: 'ENCORE', encoreBonus: 'ENCORE BONUS',
  encoreGates: 'ENCORE PASSED', totalScore: 'TOTAL SCORE',
  gateSummary: '{encountered} ENCOUNTERED · {unreached} UNREACHED',
  mainComplete: 'MAIN COMPLETE', mainCompleteEncore: 'MAIN COMPLETE · ENCORE AHEAD',
  prismShield: 'PRISM SHIELD', lumen: 'LUMEN +{points}', encorePassed: 'ENCORE +{points}',
  precisionBonus: 'PRECISION +{points}', nearMissBonus: 'NEAR MISS +{points}',
  precisionCrossings: 'PRECISION', nearMissCrossings: 'NEAR MISS', crossingTotals: 'MAIN + ENCORE',
  recoveringFlight: 'RECOVERING FLIGHT', recoveryBestIneligible: 'RECOVERY · BEST INELIGIBLE',
  gateNeutralized: 'GATE NEUTRALIZED DURING RECOVERY',
  graphicsUnsupported: 'GRAPHICS UNSUPPORTED', audioUnavailable: 'AUDIO UNAVAILABLE',
  gameUnavailable: 'GAME UNAVAILABLE', graphicsUnavailable: 'GRAPHICS UNAVAILABLE',
  graphicsRecoveryFailed: 'GRAPHICS RECOVERY FAILED', paused: 'PAUSED',
  pauseUser: 'Your run is paused.', pauseBackground: 'The run paused when the page left the foreground.',
  pauseContext: 'Graphics were interrupted. Resume when you are ready.',
  pauseOrientation: 'Screen orientation changed. Resume when you are ready.',
  pausePointerLock: 'Mouse released. Resume when you are ready.',
  audioStartFailed: 'Audio could not start. Try again or play with sound off.',
  gameLoadFailed: 'The game could not load.',
  graphicsInitFailed: 'Could not initialize a required graphics resource.',
  contextPending: 'Graphics were interrupted. Waiting for WebGL to recover.',
  contextFailed: 'WebGL did not recover. Try again to start a new run.',
  webglUnavailable: 'This browser could not start WebGL2.',
  webglLimits: 'WebGL2 limits are too low for the procedural scene.',
  graphicsUnsupportedDetail: 'This device could not render the scene. Try another WebGL2-capable browser or device.',
  creditsIntro: 'A browser rhythm runner. Thread the gates, ride the beat.',
  madeBy: 'Made by', generated: 'Every material, shader, texture and note is generated at runtime.',
  inspiration: 'INSPIRATION', inspiredBy: 'Inspired by',
  localLicenses: 'SoFarAway uses BSD-3-Clause. Rajdhani and Chakra Petch use SIL OFL 1.1.',
  onX: 'LibreCosta on X', onGitHub: 'SoFarAway on GitHub', sound: 'Sound',
  soundOn: 'SOUND ON', soundOff: 'SOUND OFF', mutedNotice: 'MUTED', synthesized: 'SYNTHESIZED',
  linkCopied: 'LINK COPIED', copyFailed: 'COULD NOT COPY LINK',
} as const;

type MessageKey = keyof typeof en;
type Variables<Text extends string> = Text extends `${string}{${infer Name}}${infer Rest}` ? Name | Variables<Rest> : never;
type Dictionary = Record<MessageKey, string>;
type MatchingVariables<Translation extends Dictionary> = {
  [K in MessageKey]: [Variables<Translation[K]>] extends [Variables<typeof en[K]>]
    ? [Variables<typeof en[K]>] extends [Variables<Translation[K]>] ? Translation[K] : never : never;
};

const zh = {
  credits: '制作名单', share: '分享', settings: '设置', close: '关闭',
  creditsDialog: '制作名单', settingsDialog: '设置', orientationLabel: '屏幕方向', pauseAction: '暂停',
  proceduralRunner: '程序化音乐跑酷', tagline: '随节奏飞行',
  noScript: '请启用 JavaScript，并使用支持 WebGL2 的浏览器游玩。',
  canvasLabel: 'SoFarAway 游戏画面', volumeSelector: '分卷选择',
  previousVolume: '上一卷', nextVolume: '下一卷',
  previousOption: '上一个{option}', nextOption: '下一个{option}',
  playMode: '游戏模式', difficulty: '难度', showcaseRoute: '展示路线',
  standard: '标准', sightseeing: '观光', showcase: '展示',
  easy: '简单', normal: '普通', hard: '困难', impossible: '极限',
  routeMain: '主线', routeChallenge: '挑战', routeBonus: '奖励', resultRoute: '{route}路线',
  showcaseDetail: '自动驾驶 · 极限赛道 · 不计分',
  sightseeingDetail: '{count} 条生命 · 三分之一速度', oneLife: '{count} 条生命', lives: '{count} 条生命',
  livesRemaining: '生命剩余 {remaining} 条，共 {total} 条',
  localRecords: '本地成绩', bestScore: '最高分', lastVisit: '上次观光', lastRun: '上次飞行',
  recovery: '中断恢复', recoveredGates: '{count} 道门因恢复跳过', bestIneligible: '不计入最高分',
  initializing: '正在初始化', starting: '即将起飞', start: '开始 · 按 X', startShowcase: '开始展示',
  fullScreen: '全屏', exitFullScreen: '退出全屏',
  quality: '画质', qualityGroup: '画质', high: '高', auto: '自动', low: '低', volume: '音量', mute: '静音',
  language: '语言', dynamicLights: '动态灯光',
  reducedLights: '系统已启用减少动态效果，节拍灯效已暂停。',
  lightsHelp: '走廊灯光在节拍间变暗，随鼓点亮起。',
  immersiveMouse: '沉浸式鼠标',
  immersiveHelp: '飞行时锁定鼠标。按 Esc 释放鼠标并暂停。',
  orientation: '屏幕方向', landscape: '横屏', portrait: '竖屏',
  fullscreen: '全屏', enterFullscreen: '进入全屏', exitFullscreen: '退出全屏',
  fullscreenUnavailable: '全屏不可用。', fullscreenUnavailableNotice: '全屏不可用',
  autoBoost: '全程加速', autoBoostHelp: '在标准模式中持续加速，无需按住加速键。',
  autoBoostLocked: '本次飞行已锁定加速设置，返回菜单后可更改。',
  controls: '操作说明',
  steerHelp: '移动鼠标、在屏幕上拖动，或使用方向键、WASD 转向。',
  boostHelp: '按住 Shift 或鼠标左键加速。使用触屏时，可在设置中开启全程加速。',
  shortcutsHelp: 'X 开始或重试。P 暂停或继续。M 切换静音。Esc 返回。',
  score: '得分', sector: '阶段', gates: '穿越障碍', velocity: '速度', link: '连击',
  shieldStatus: '护盾 ×{count}', resonance: '共鸣 ×{count}',
  enteringRoute: '正在进入{route}路线。',
  routeHint: '向左进入{left}路线，直行进入{main}路线，向右进入{right}路线。',
  holdBoost: '按住 Shift 加速', moveSteer: '移动以转向', touchSteer: '拖动以转向', boost: '加速',
  restoreSound: '声音已关闭 · 恢复音频', pause: '暂停', resume: '继续', tryAgain: '重试',
  playSilent: '静音游玩', menu: '返回主菜单', replay: '重新播放', runAgain: '再飞一次 · 按 X',
  escaped: '已撤离', terminated: '飞行终止', showcaseComplete: '展示完成',
  showcaseInterrupted: '展示中断', mainScore: '主赛道得分', newBest: '刷新纪录',
  maxLink: '最高连击', accuracy: '通过率', encore: '返场', encoreBonus: '返场奖励',
  encoreGates: '返场门数', totalScore: '总分',
  gateSummary: '遇到 {encountered} 道门 · 未到达 {unreached} 道门',
  mainComplete: '主赛道完成', mainCompleteEncore: '主赛道完成 · 即将返场',
  prismShield: '棱镜护盾', lumen: '流明 +{points}', encorePassed: '返场 +{points}',
  precisionBonus: '精准穿越 +{points}', nearMissBonus: '惊险穿越 +{points}',
  precisionCrossings: '精准穿越', nearMissCrossings: '惊险穿越', crossingTotals: '主赛道 + 返场',
  recoveringFlight: '正在恢复飞行', recoveryBestIneligible: '中断恢复 · 不计入最高分',
  gateNeutralized: '恢复时跳过了一道门',
  graphicsUnsupported: '不支持图形渲染', audioUnavailable: '音频不可用',
  gameUnavailable: '游戏不可用', graphicsUnavailable: '图形渲染不可用',
  graphicsRecoveryFailed: '图形渲染恢复失败', paused: '已暂停',
  pauseUser: '飞行已暂停。', pauseBackground: '页面离开前台时，飞行已暂停。',
  pauseContext: '图形渲染中断，准备好后可继续。',
  pauseOrientation: '屏幕方向已改变，准备好后可继续。',
  pausePointerLock: '鼠标已释放，准备好后可继续。',
  audioStartFailed: '音频启动失败，请重试或静音游玩。',
  gameLoadFailed: '游戏加载失败。',
  graphicsInitFailed: '无法初始化游戏所需的图形资源。',
  contextPending: '图形渲染中断，正在等待 WebGL 恢复。',
  contextFailed: 'WebGL 未能恢复，请重试以开始新一轮飞行。',
  webglUnavailable: '此浏览器无法启动 WebGL2。',
  webglLimits: '当前设备的 WebGL2 性能限制无法满足程序生成场景的要求。',
  graphicsUnsupportedDetail: '此设备无法渲染场景，请换用支持 WebGL2 的浏览器或设备。',
  creditsIntro: '一款浏览器节奏跑酷游戏。穿越飞行门，跟随音乐节拍。',
  madeBy: '制作', generated: '所有材质、着色器、纹理和音符均在运行时生成。',
  inspiration: '灵感来源', inspiredBy: '灵感来自',
  localLicenses: 'SoFarAway 采用 BSD-3-Clause 许可。Rajdhani 和 Chakra Petch 字体采用 SIL OFL 1.1 许可。',
  onX: 'LibreCosta 的 X 主页', onGitHub: 'SoFarAway 的 GitHub 仓库', sound: '声音',
  soundOn: '声音已开启', soundOff: '声音已关闭', mutedNotice: '已静音', synthesized: '实时合成',
  linkCopied: '链接已复制', copyFailed: '无法复制链接',
} as const satisfies Dictionary;

const dictionaries = { en, 'zh-CN': zh satisfies MatchingVariables<typeof zh> };
type Params<K extends MessageKey> = [Variables<typeof en[K]>] extends [never] ? []
  : [values: Record<Variables<typeof en[K]>, string | number>];

const routes = { main: 'routeMain', challenge: 'routeChallenge', score: 'routeBonus' } as const satisfies Record<RouteKind, MessageKey>;
const outcomes = { ESCAPED: 'escaped', TERMINATED: 'terminated' } as const satisfies Record<RunResult['title'], MessageKey>;
const pauses = {
  user: 'pauseUser', background: 'pauseBackground', context: 'pauseContext',
  'pointer-lock': 'pausePointerLock', orientation: 'pauseOrientation',
} as const satisfies Record<PauseReason, MessageKey>;

export function createPlayerText(locale: Locale) {
  const dictionary = dictionaries[locale];
  const number = new Intl.NumberFormat(locale, { useGrouping: false });
  const grouped = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: 'percent' });
  function t<K extends MessageKey>(key: K, ...args: Params<K>): string {
    const value: string = dictionary[key];
    const params: Record<string, string | number> | undefined = args[0];
    return params ? value.replace(/\{(\w+)\}/g, (_, name: string) => {
      const parameter = params[name];
      return typeof parameter === 'number' ? number.format(parameter) : parameter;
    }) : value;
  }
  return {
    t, locale, number: number.format, percent: percent.format,
    score: (value: number | null | undefined) => value == null ? '—' : grouped.format(value),
    mode: (value: ExperienceMode) => t(value),
    difficulty: (value: Difficulty) => t(value),
    orientation: (value: OrientationPreference) => t(value),
    quality: (value: QualityTier) => t(value),
    route: (value: RouteKind) => t(routes[value]),
    outcome: (value: RunResult['title']) => t(outcomes[value]),
    pause: (value: PauseReason) => t(pauses[value]),
    message: (value: PlayerMessage | null) => {
      if (!value) return '';
      if ('count' in value) return t(value.id, { count: value.count });
      if ('points' in value) return t(value.id, { points: value.points });
      return t(value.id);
    },
  };
}
