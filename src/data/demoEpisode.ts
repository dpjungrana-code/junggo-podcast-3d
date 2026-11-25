export type StudioMode = "solo" | "dual";

export type PodcastSectionType =
  | "intro"
  | "story"
  | "vocabulary"
  | "grammar"
  | "kanji_lesson"
  | "dialogue"
  | "quiz";

export type HostGestureType =
  | "point_board"
  | "nod_encourage"
  | "thinking"
  | "none";

export type KanjiExampleWord = {
  readonly word: string;
  readonly reading: string;
  readonly romaji: string;
  readonly meaning: string;
};

export type KanjiLessonData = {
  readonly kanji: string;
  readonly jlptLevel: string;
  readonly onyomi: string;
  readonly kunyomi: string;
  readonly meaningEn: string;
  readonly meaningNp?: string;
  readonly mnemonic: string;
  readonly strokeCount?: number;
  readonly examples: readonly KanjiExampleWord[];
  readonly visualPrompt?: string;
  readonly imageUrl?: string;
  readonly imageCaption?: string;
};

export type SubtitleCue = {
  readonly id: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly speaker: string;
  readonly japanese: string;
  readonly romaji: string;
  readonly english: string;
  readonly gesture?: HostGestureType;
  readonly imageUrl?: string;
  readonly imageCaption?: string;
};

export const isGuestSpeaker = (speaker: string): boolean => {
  const normalized = speaker.trim().toLowerCase();
  return normalized === "maria" || normalized === "yuki";
};

const POINT_BOARD_KEYWORDS = [
  "見てください",
  "みてください",
  "こちら",
  "ボード",
  "画面",
  "図",
  "写真",
  "look here",
  "on the board",
  "look at the board",
  "picture",
  "diagram",
  "take a look",
];

const NOD_ENCOURAGE_KEYWORDS = [
  "正解",
  "素晴らしい",
  "いいですね",
  "その通り",
  "よくできました",
  "バッチリ",
  "すごい",
  "correct",
  "great job",
  "well done",
  "exactly",
  "good question",
  "nice question",
];

const THINKING_KEYWORDS = [
  "どれでしょう",
  "考えて",
  "クイズ",
  "意味は",
  "what does",
  "which one",
  "can you guess",
  "think about",
];

export const resolveCueGesture = (
  cue: SubtitleCue,
  section?: EpisodeSection,
  forGuest = false,
): HostGestureType => {
  const cueFromGuest = isGuestSpeaker(cue.speaker);
  if (cue.gesture !== undefined) {
    return cueFromGuest === forGuest ? cue.gesture : "none";
  }
  if (cueFromGuest !== forGuest) {
    return "none";
  }

  const jp = cue.japanese;
  const en = cue.english.toLowerCase();
  const matchesAny = (keywords: readonly string[]) =>
    keywords.some((kw) => jp.includes(kw) || en.includes(kw));

  if (matchesAny(POINT_BOARD_KEYWORDS)) {
    return "point_board";
  }
  if (matchesAny(NOD_ENCOURAGE_KEYWORDS)) {
    return "nod_encourage";
  }
  if (matchesAny(THINKING_KEYWORDS)) {
    return "thinking";
  }

  return !forGuest ? (section?.gesture ?? "none") : "none";
};

export type VocabCardData = {
  readonly word: string;
  readonly reading: string;
  readonly romaji: string;
  readonly meaning: string;
  readonly partOfSpeech: string;
  readonly jlptLevel: string;
  readonly exampleJp: string;
  readonly exampleRomaji: string;
  readonly exampleEn: string;
  readonly imageUrl?: string;
  readonly imageSrc?: string;
  readonly imageCaption?: string;
};

export type QuizOption = {
  readonly label: "A" | "B" | "C";
  readonly jp: string;
  readonly romaji: string;
  readonly english: string;
  readonly isCorrect: boolean;
};

export type QuizCardData = {
  readonly title: string;
  readonly questionJp: string;
  readonly questionEn: string;
  readonly options: readonly QuizOption[];
  readonly countdownStartSec: number;
  readonly countdownDurationSec: number;
  readonly revealSec: number;
};

export type EpisodeSection = {
  readonly id: string;
  readonly type: PodcastSectionType;
  readonly label: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly gesture?: HostGestureType;
  readonly vocab?: VocabCardData;
  readonly kanji?: KanjiLessonData;
  readonly quiz?: QuizCardData;
  readonly imageUrl?: string;
  readonly imageSrc?: string;
  readonly imageCaption?: string;
};

export type EpisodeData = {
  readonly episodeNumber: string;
  readonly title: string;
  readonly jlptLevel: string;
  readonly durationSec: number;
  readonly studioMode?: StudioMode;
  readonly audioSrc?: string;
  readonly sections: readonly EpisodeSection[];
  readonly subtitles: readonly SubtitleCue[];
};

export const DEMO_EPISODE: EpisodeData = {
  episodeNumber: "EP. 01",
  title: "Morning Coffee in Tokyo",
  jlptLevel: "JLPT N5",
  durationSec: 30,
  sections: [
    {
      id: "sec-intro",
      type: "intro",
      label: "INTRO",
      startSec: 0,
      endSec: 7,
    },
    {
      id: "sec-vocab",
      type: "vocabulary",
      label: "VOCABULARY",
      startSec: 7,
      endSec: 15,
      vocab: {
        word: "おいしい",
        reading: "美味しい",
        romaji: "oishii",
        meaning: "Delicious / Tasty",
        partOfSpeech: "i-Adjective",
        jlptLevel: "JLPT N5",
        exampleJp: "このコーヒーはとてもおいしいです。",
        exampleRomaji: "Kono koohii wa totemo oishii desu.",
        exampleEn: "This coffee is very delicious.",
      },
    },
    {
      id: "sec-dialogue",
      type: "dialogue",
      label: "DIALOGUE",
      startSec: 15,
      endSec: 22,
    },
    {
      id: "sec-quiz",
      type: "quiz",
      label: "QUICK QUIZ",
      startSec: 22,
      endSec: 30,
      quiz: {
        title: "JLPT N5 LISTENING CHECK",
        questionJp: "「おいしい」の意味はどれ？",
        questionEn: 'What does "oishii" mean in English?',
        options: [
          {
            label: "A",
            jp: "あつい",
            romaji: "atsui",
            english: "Hot",
            isCorrect: false,
          },
          {
            label: "B",
            jp: "おいしい",
            romaji: "oishii",
            english: "Delicious",
            isCorrect: true,
          },
          {
            label: "C",
            jp: "たかい",
            romaji: "takai",
            english: "Expensive",
            isCorrect: false,
          },
        ],
        countdownStartSec: 23.0,
        countdownDurationSec: 4.5,
        revealSec: 27.5,
      },
    },
  ],
  subtitles: [
    // INTRO (0s - 7s)
    {
      id: "sub-1",
      startSec: 0.4,
      endSec: 3.5,
      speaker: "JungGo",
      japanese: "みなさん、こんばんは！JungGoポッドキャストへようこそ。",
      romaji: "Minasan, konbanwa! JungGo Poddokyasuto e youkoso.",
      english: "Good evening, everyone! Welcome to the JungGo Podcast.",
    },
    {
      id: "sub-2",
      startSec: 3.7,
      endSec: 6.8,
      speaker: "JungGo",
      japanese: "今日は東京のカフェで使えるN5の言葉を学びましょう。",
      romaji: "Kyou wa Toukyou no kafe de tsukaeru N5 no kotoba o manabimashou.",
      english: "Today let's learn an N5 word you can use at a Tokyo cafe.",
    },
    // VOCABULARY (7s - 15s)
    {
      id: "sub-3",
      startSec: 7.3,
      endSec: 10.8,
      speaker: "JungGo",
      japanese: "今日のキーワードは「おいしい」です。",
      romaji: 'Kyou no kiiwaado wa "oishii" desu.',
      english: 'Today\'s keyword is "oishii" — meaning delicious!',
    },
    {
      id: "sub-4",
      startSec: 11.1,
      endSec: 14.7,
      speaker: "JungGo",
      japanese: "たとえば、「このコーヒーはとてもおいしいです。」",
      romaji: 'Tatoeba, "Kono koohii wa totemo oishii desu."',
      english: 'For example: "This coffee is very delicious."',
    },
    // DIALOGUE (15s - 22s)
    {
      id: "sub-5",
      startSec: 15.2,
      endSec: 18.3,
      speaker: "JungGo",
      japanese: "すみません、ホットコーヒーをひとつください。",
      romaji: "Sumimasen, hotto koohii o hitotsu kudasai.",
      english: "Excuse me, one hot coffee please.",
    },
    {
      id: "sub-6",
      startSec: 18.6,
      endSec: 21.8,
      speaker: "Yuki",
      japanese: "はい、どうぞ！とてもおいしいですよ。",
      romaji: "Hai, douzo! Totemo oishii desu yo.",
      english: "Here you go! It's really delicious.",
    },
    // QUIZ (22s - 30s)
    {
      id: "sub-7",
      startSec: 22.3,
      endSec: 27.2,
      speaker: "JungGo",
      japanese: "さあ、クイズです！「おいしい」の意味はA、B、Cのどれでしょう？",
      romaji: 'Saa, kuizu desu! "Oishii" no imi wa A, B, C no dore deshou?',
      english: 'Now for a quick quiz! Which option means "oishii" — A, B, or C?',
    },
    {
      id: "sub-8",
      startSec: 27.5,
      endSec: 29.8,
      speaker: "JungGo",
      japanese: "正解はBの「Delicious」でした！よくできました！",
      romaji: 'Seikai wa B no "Delicious" deshita! Yoku dekimashita!',
      english: 'The correct answer is B, "Delicious"! Great job!',
    },
  ],
};

export const getActiveSection = (
  sections: readonly EpisodeSection[],
  timeSec: number,
): EpisodeSection => {
  for (const section of sections) {
    if (timeSec >= section.startSec && timeSec < section.endSec) {
      return section;
    }
  }
  return sections[sections.length - 1];
};

export const getActiveSubtitle = (
  subtitles: readonly SubtitleCue[],
  timeSec: number,
): SubtitleCue | null => {
  for (const cue of subtitles) {
    if (timeSec >= cue.startSec && timeSec < cue.endSec) {
      return cue;
    }
  }
  return null;
};
