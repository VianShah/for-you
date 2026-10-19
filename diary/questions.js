/* The question jar. Add your own anytime: keep each id unique and never
   reuse an old id (answers in the diary are linked to it). */
const CATEGORIES = {
  deeper:    { label: "Know me deeper",     emoji: "🔍" },
  think:     { label: "Make us think",      emoji: "🧠" },
  believe:   { label: "What I believe",     emoji: "🕯️" },
  strengths: { label: "My strengths",       emoji: "💪" },
  together:  { label: "Us, together",       emoji: "🤝" },
  grow:      { label: "How I want to grow", emoji: "🌱" },
  dreams:    { label: "Dreams & goals",     emoji: "🌠" },
  foryou:    { label: "For each other",     emoji: "💌" },
};

const QUESTION_TEXT = {
  deeper: [
    "What's a memory from childhood that still shapes how you see the world?",
    "When do you feel most like yourself?",
    "What's something you've never fully said out loud, but want me to know?",
    "What makes you feel truly safe with someone?",
    "What's a small thing that instantly ruins your day, and a small thing that saves it?",
    "Which version of you do most people never get to see?",
    "What did you need more of growing up?",
    "What's something you're quietly proud of that nobody ever asks about?",
    "When you're overwhelmed, what do you wish people would do?",
    "What's a fear you've outgrown, and one you're still working on?",
  ],
  think: [
    "If you could know the answer to one question about the universe, what would you ask?",
    "Is it better to be deeply good at one thing or decent at many? Why?",
    "What's an opinion you've completely changed in the last few years?",
    "If every job paid the same, what would you do all day?",
    "What does a \"good life\" actually mean to you?",
    "Would you rather remember everything, or be able to forget anything you choose?",
    "What's something everyone accepts that you think is quietly wrong?",
    "If you could master any skill overnight, which one, and what's the first thing you'd do with it?",
    "Do people really change, or do they just learn to manage who they are?",
    "What invention or idea do you wish already existed?",
  ],
  believe: [
    "What do you believe about love that most people don't?",
    "What's one value you'd never compromise on?",
    "Do you believe things happen for a reason?",
    "What does home mean to you: a place, a person or a feeling?",
    "What do you think we owe the people we love?",
    "What's a belief your family gave you that you've kept, and one you've let go of?",
    "What does forgiveness look like to you?",
    "Where do you find meaning on the hard days?",
    "What do you think makes a relationship last?",
    "What does kindness look like when no one is watching?",
  ],
  strengths: [
    "What's a strength of yours you think I don't notice enough?",
    "What's a strength you see in me that I might not see in myself?",
    "When have you surprised yourself by how strong you were?",
    "What do people come to you for?",
    "Which of your strengths sometimes turns into a weakness?",
    "What are you naturally good at that took others years to learn?",
    "What part of yourself are you learning to love?",
    "Which of my strengths do you lean on the most?",
    "What compliment has stayed with you the longest?",
    "What's a hard thing you handled that you never got credit for?",
  ],
  together: [
    "What's something we could build or create together one day?",
    "Where do we balance each other out the best?",
    "What's one thing we could get better at as a team?",
    "What's a tradition you'd love for us to start?",
    "What's a project or adventure we should take on this year?",
    "How do you like to be supported when you're chasing something big?",
    "What's one way I make your life easier, and one way I could do it more?",
    "If we wrote a rulebook for us, what would rule #1 be?",
    "What's a skill you'd love for us to learn side by side?",
    "What do you think our biggest superpower as a couple is?",
  ],
  grow: [
    "Who do you want to be five years from now?",
    "What habit would change your life if you actually stuck with it?",
    "What's something you want to unlearn?",
    "Where do you feel stuck right now?",
    "What's one thing you want to get braver about?",
    "How can I help you grow without pushing too hard?",
    "What's a lesson you keep having to relearn?",
    "What would you try if you knew you couldn't fail?",
    "What does taking care of yourself really look like for you?",
    "What used to scare you that you want to try again?",
  ],
  dreams: [
    "What's a dream you've had for so long you're almost afraid to say it?",
    "What does your dream ordinary Tuesday look like in ten years?",
    "What's one goal you want to reach before the end of this year?",
    "If money didn't matter, where would we live?",
    "What do you want to be remembered for?",
    "What's a place you have to see in this lifetime?",
    "What's an ambition you've put on hold, and what would it take to restart it?",
    "What does success look like to you, honestly, not the version others expect?",
    "What's the next small step toward your biggest dream?",
    "Which of my dreams do you most want to see come true?",
  ],
  foryou: [
    "What's one thing I do that makes you feel loved without me even trying?",
    "What's a little thing I could do this week that would make your day?",
    "When did you first know I was your person?",
    "What's something about me you hope never changes?",
    "What do you want me to remember on your hardest days?",
    "What's a moment with me you'd relive exactly as it was?",
    "How do you most like to be comforted: words, hugs, space or distraction?",
    "What's something you've always wanted to thank me for?",
    "What's a promise you'd like us to make to each other?",
    "Describe us in three words, and explain each one.",
  ],
};

// Flat list: { id: "deeper-1", cat: "deeper", q: "…" }
const QUESTIONS = Object.entries(QUESTION_TEXT).flatMap(([cat, list]) =>
  list.map((q, i) => ({ id: `${cat}-${i + 1}`, cat, q })));
const questionById = id => QUESTIONS.find(x => x.id === id);

// Same question for both phones on the same day.
function todaysQuestion(date = new Date()) {
  const day = date.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
  return QUESTIONS[hash("today:" + day) % QUESTIONS.length];
}
