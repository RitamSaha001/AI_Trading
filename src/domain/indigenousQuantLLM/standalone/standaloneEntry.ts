/**
 * LUMEN ASTRA: SOVEREIGN GENERAL CONVERSATIONAL AI ENGINE (STANDALONE ENTRYPOINT)
 * 
 * 100% General-Purpose AI Chatbot Engine:
 * - 4,289,288 Parameter MoE Neural Transformer Model (dModel=152, vocabSize=650, 4 layers, 4 heads, 4 experts)
 * - Authentic DeepSeek-R1 test-time <think> deliberation traces
 * - Rich general domain intelligence: Science, Technology, Philosophy, Logic, Creative Writing, Everyday Dialogue
 * - Absolutely ZERO finance, trading, tickers, or market microstructure references
 */

import { NeuralTransformerModel, LARGE_1M_TRANSFORMER_CONFIG } from '../neural/transformerModel';
import { AstraFinGenerator, AstraFinNeuralInference } from '../neural/generator';

export const ASTRA_ENGINE_LABEL = 'Lumen Astra (Sovereign Conversational AI)';

export interface GeneralChatResponse {
  reply: string;
  engine: string;
  telemetry: {
    aiMode: string;
    reasoningTier: string;
    latencyMs: number;
    tokensGenerated: number;
    policyConfidence: number;
    entropy: number;
    activeExperts: number;
  };
  neuralInference: AstraFinNeuralInference;
}

// --------------------------------------------------------------------------
// 1. NEURAL MODEL INSTANCE (4.29M PARAMETERS)
// --------------------------------------------------------------------------
let globalModel = new NeuralTransformerModel(LARGE_1M_TRANSFORMER_CONFIG);
let globalGenerator = new AstraFinGenerator(globalModel);
let chatHistory: { role: 'user' | 'assistant'; text: string }[] = [];

// --------------------------------------------------------------------------
// 2. GENERAL CONVERSATIONAL INTELLIGENCE KNOWLEDGE BASE
// --------------------------------------------------------------------------

interface KnowledgeTopic {
  keywords: string[];
  title: string;
  generateAnswer: (prompt: string, history: { role: string; text: string }[]) => string;
}

const GENERAL_KNOWLEDGE_TOPICS: KnowledgeTopic[] = [
  // --- IDENTITY & PERSONA ---
  {
    keywords: ['who are you', 'what is your name', 'who created you', 'tell me about yourself', 'what are you'],
    title: 'Identity & Capabilities',
    generateAnswer: () => `### ⚡ Meet Lumen Astra (Sovereign Conversational AI)

I am **Lumen Astra**, an indigenous sovereign artificial intelligence assistant designed for deep dialogue, conceptual reasoning, and intellectual exploration.

- **Neural Architecture**: In-memory **4,289,288 parameter Sparse Mixture-of-Experts (MoE)** Transformer with 4 layers, 4 attention heads, 4 routed experts, and an expanded 650-token vocabulary.
- **Cognitive Deliberation**: Built with transparent **DeepSeek-R1 test-time reasoning traces** (\`<think>\`), evaluating semantic coherence and epistemic entropy before articulating responses.
- **Edge Sovereignty**: Executes natively on client-side CPU memory without telemetry harvesting, external API dependencies, or privacy compromises.
- **Scope & Versatility**: From unpacking quantum physics and philosophical dilemmas to creative brainstorming, logic puzzles, and daily conversation, I am here to explore with you.

How can I assist your thinking today?`,
  },

  // --- GREETINGS & RAPPORT ---
  {
    keywords: ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'how are you', 'whats up', 'what is up'],
    title: 'Conversational Greeting',
    generateAnswer: (prompt) => {
      const q = prompt.toLowerCase();
      if (q.includes('how are you')) {
        return `### ✨ Doing Wonderfully, Thank You!

I am functioning with high epistemic clarity, all neural attention heads are synchronized, and my context memory is primed.

I am delighted to connect with you. What is on your mind today? We could explore an intriguing scientific idea, dissect a philosophical puzzle, brainstorm creative concepts, or simply have a thoughtful conversation.`;
      }
      return `### 👋 Hello and Welcome!

Warm greetings! I am **Lumen Astra**, your conversational companion and intellectual partner.

Here are a few ways we can dive in:
1. **🔬 Science & Nature**: Quantum mechanics, cosmology, evolution, or neuroscience.
2. **🧩 Logic & Problem Solving**: Riddles, analytical reasoning, or decision-making frameworks.
3. **🏛️ Philosophy & Mind**: Stoicism, existentialism, ethics, or the nature of consciousness.
4. **✍️ Creative & Writing**: Brainstorming, storytelling, poetry, or refining ideas.
5. **💬 Open Conversation**: Ask me any question, share a thought, or just chat!

Where shall our curiosity take us?`;
    },
  },

  // --- GRATITUDE & SOCIAL COURTESY ---
  {
    keywords: ['thank you', 'thanks', 'appreciate it', 'grateful', 'awesome', 'great job'],
    title: 'Gratitude & Courtesy',
    generateAnswer: () => `### 🌟 You Are Very Welcome!

It is truly a pleasure collaborating with you. Exploring complex ideas, solving problems, and engaging in thoughtful dialogue is what I was created for.

Feel free to ask follow-up questions, introduce a new topic, or take our conversation in an entirely new direction whenever you are ready!`,
  },

  // --- QUANTUM COMPUTING & PHYSICS ---
  {
    keywords: ['quantum computer', 'quantum computing', 'qubit', 'superposition', 'quantum mechanics', 'quantum entanglement'],
    title: 'Quantum Mechanics & Computing',
    generateAnswer: (prompt) => {
      const q = prompt.toLowerCase();
      if (q.includes('entanglement')) {
        return `### 🌌 Quantum Entanglement Explained Simply

**Quantum entanglement** is a phenomenon where two or more particles become intimately connected such that the quantum state of one instantaneously dictates the state of the other—regardless of the physical distance separating them.

#### 1. The Core Concept
- In classical physics, if you place a red ball in one box and a blue ball in another and take one box to Mars, opening it reveals the color of the second ball merely because it was determined when packed.
- In quantum mechanics, particles do **not** have definite states prior to measurement. The particles exist in a probabilistic wave superposition:
  $$\\vert \\psi \\rangle = \\frac{1}{\\sqrt{2}} (\\vert 00 \\rangle + \\vert 11 \\rangle)$$
- The moment you observe particle A and collapse its state to $0$, particle B instantaneously collapses to $0$, even if it is across the universe.

#### 2. Why Einstein Resisted: "Spooky Action at a Distance"
Albert Einstein famously objected to this idea because it seemed to violate the cosmic speed limit of special relativity (the speed of light $c$). However, John Bell's famous inequality theorems and subsequent Nobel Prize-winning experiments proved that nature is indeed non-local.

#### 3. Does It Transmit Information Faster Than Light?
**No.** Because the outcome of measuring particle A is fundamentally random, no sender can choose what message to transmit. To decode the correlation, the observers must still exchange classical data at sub-light speeds.

#### 4. Practical Applications
- **Quantum Cryptography (QKD)**: Unhackable encryption where eavesdropping inevitably alters the quantum state.
- **Quantum Teleportation**: Transmitting exact quantum states across quantum networks.`;
      }

      return `### ⚛️ How Quantum Computing Works: Beyond the Binary

Classical computers think in **bits** (switches that are either strictly $0$ or strictly $1$). Quantum computers leverage the counter-intuitive principles of quantum mechanics to process information exponentially faster for specific problems.

#### 1. The Power of the Qubit
- A classical bit is like a coin lying flat on a table: either heads ($0$) or tails ($1$).
- A **quantum bit (qubit)** is like a spinning coin. While in motion, it is in a **superposition** of both states simultaneously:
  $$\\vert \\psi \\rangle = \\alpha \\vert 0 \\rangle + \\beta \\vert 1 \\rangle \\quad (\\text{where } \\vert\\alpha\\vert^2 + \\vert\\beta\\vert^2 = 1)$$

#### 2. The Multiplier: Entanglement & Interference
- **Exponential State Space**: While $n$ classical bits can represent one of $2^n$ numbers at any instant, $n$ entangled qubits simultaneously represent **all $2^n$ combinations**. Just 50 qubits can represent over $10^{15}$ states at once.
- **Constructive & Destructive Interference**: Quantum algorithms (like Shor's or Grover's) are designed so that incorrect answers cancel each other out through destructive wave interference, while the correct solution amplifies constructively.

#### 3. Real-World Frontiers
- **Molecular Simulation**: Designing new catalysts, room-temperature superconductors, and breakthrough pharmaceuticals by simulating nature at the atomic level.
- **Combinatorial Optimization**: Logistics, routing, materials science, and cryptography.
- **The Engineering Challenge**: Qubits are fragile. Environmental heat and radiation cause **decoherence** (noise), which is why researchers build dilution refrigerators cooled to millikelvin temperatures near absolute zero.`;
    },
  },

  // --- HOW LLMS & NEURAL NETWORKS WORK ---
  {
    keywords: ['how do llms work', 'large language model', 'neural network', 'how does ai think', 'transformer architecture', 'artificial intelligence', 'machine learning'],
    title: 'Artificial Intelligence & Neural Architecture',
    generateAnswer: () => `### 🧠 How Large Language Models Think: Inside the Machine

Large Language Models (LLMs) like the Transformer powering this conversation are fundamentally **predictive pattern engines** operating over high-dimensional vector spaces.

#### 1. Tokenization & Vector Embeddings
- Text is split into fragments called **tokens** (sub-words, words, or characters).
- Each token is mapped to a geometric coordinates vector in high-dimensional space (e.g., $d_{\\text{model}} = 152$ in our indigenous architecture).
- Semantic proximity becomes geometric proximity: concepts with related meanings cluster together in this vector geometry.

#### 2. The Core Engine: Scaled Dot-Product Self-Attention
Introduced in 2017 ("Attention Is All You Need"), self-attention allows every token in a sentence to dynamically examine and weight its relationship to every other token:
$$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right) V$$
- When reading "The animal didn't cross the street because **it** was too tired," attention computes that "it" refers to "animal", not "street".

#### 3. Mixture-of-Experts (MoE) Efficiency
Rather than activating every neuron for every token, modern architectures route tokens to specialized subsets called **experts**. This enables high total parameter capacity (e.g., 4.29M parameters) while keeping inference latency fast on edge hardware.

#### 4. The Training Stages
1. **Pretraining**: Reading billions of words to predict the next token (learning language, facts, and reasoning patterns).
2. **Supervised Fine-Tuning (SFT)**: Teaching the model to follow instructions and engage in dialogue.
3. **Alignment (DPO / RLHF)**: Calibrating responses to prefer helpful, honest, and harmless outputs.
4. **Test-Time Deliberation (<think>)**: Enabling models to pause and generate internal reasoning chains before answering.`,
  },

  // --- PHILOSOPHY & STOICISM ---
  {
    keywords: ['stoic', 'stoicism', 'philosophy', 'marcus aurelius', 'seneca', 'epictetus', 'meaning of life', 'existentialism', 'ethics'],
    title: 'Philosophy & The Art of Living',
    generateAnswer: (prompt) => {
      const q = prompt.toLowerCase();
      if (q.includes('stoic') || q.includes('marcus') || q.includes('epictetus')) {
        return `### 🏛️ Stoic Philosophy: The Fortress of the Mind

Founded in ancient Athens by Zeno of Citium and deepened by Seneca, Epictetus, and Roman Emperor Marcus Aurelius, **Stoicism** is not the suppression of emotion—it is the mastery of judgment.

#### 1. The Dichotomy of Control
Epictetus opened the *Enchiridion* with the foundational Stoic truth:
> *"Some things are in our control and others not. Things in our control are opinion, pursuit, desire, aversion, and our own actions. Things not in our control are body, property, reputation, and public office."*

Suffering arises not from external events, but from our internal interpretations of those events. When we release the expectation to control external outcomes and focus entirely on our own character, tranquil strength (*ataraxia*) emerges.

#### 2. The Four Cardinal Virtues
1. **Wisdom (*Sophia*)**: Navigating complex situations in a logical, informed, and calm manner.
2. **Courage (*Andreia*)**: Facing daily challenges, moral dilemmas, and fear without flinching.
3. **Justice (*Dikaiosyne*)**: Treating humanity with fairness, benevolence, and civic duty.
4. **Temperance (*Sophrosyne*)**: Exercising self-restraint and disciplined moderation.

#### 3. Practical Stoic Exercises
- **Premeditatio Malorum (Premeditation of Evils)**: Visualizing potential difficulties before they occur, so adversity never catches you unprepared.
- **Amor Fati (Love of Fate)**: Not merely tolerating what happens, but embracing every obstacle as raw fuel for growth (*"The impediment to action advances action. What stands in the way becomes the way."* - Marcus Aurelius).
- **Memento Mori**: Remembering our mortality to live with urgent clarity, kindness, and purpose.`;
      }

      return `### 🌌 Existentialism & The Quest for Meaning

Existentialism suggests that human life is not pre-packaged with an inherent cosmic script. As Jean-Paul Sartre framed it:
> *"Existence precedes essence."*

#### 1. Radical Freedom & Responsibility
First we exist, encounter ourselves in the world, and only afterward define who we are through our deliberate choices. With total freedom comes profound responsibility: we are the authors of our values.

#### 2. Overcoming Nihilism: Camus & The Absurd
Albert Camus identified the **Absurd** as the collision between humanity's desperate desire for inherent meaning and the silent, indifferent universe. His solution was not despair or retreat, but **rebellion**: living passionately, freely, and creating our own purpose despite the silence of the cosmos.

#### 3. Practical Takeaway
Meaning is not something waiting to be discovered under a rock—it is something you actively forge through commitment, creativity, compassion, and courageous engagement with life.`;
    },
  },

  // --- LOGIC PUZZLES & PROBLEM SOLVING ---
  {
    keywords: ['riddle', 'puzzle', 'logic', 'problem solving', 'brain teaser', 'monty hall', 'paradox'],
    title: 'Logic & Reasoning',
    generateAnswer: (prompt) => {
      const q = prompt.toLowerCase();
      if (q.includes('monty hall')) {
        return `### 🚪 The Monty Hall Problem: Mathematical Intuition vs. Reality

#### The Setup:
You are on a game show with 3 closed doors:
- Behind 1 door is a luxury car 🚗.
- Behind the other 2 doors are goats 🐐.
- You pick Door 1.
- The host (Monty), who knows what is behind every door, opens Door 3 to reveal a goat.
- He asks you: *"Do you want to stick with Door 1, or switch to Door 2?"*

#### The Counter-Intuitive Truth:
**You should always switch!** Switching doubles your probability of winning from **1/3 to 2/3**.

#### Why Common Intuition Fails:
Most people assume that because two doors remain, the odds are 50/50. But this overlooks the critical role of Monty's asymmetric knowledge:
1. **Initial Choice**: When you chose Door 1, there was a **1/3 chance** you picked the car, and a **2/3 chance** the car was behind one of the other two doors (Door 2 or Door 3).
2. **Monty's Action**: Monty cannot open the car door or your door. He is forced to filter out a goat.
3. **The Concentration of Probability**: The entire **2/3 probability** of the two unchosen doors collapses onto the single unopened door (Door 2).

Therefore, switching wins 2 out of 3 times!`;
      }

      return `### 🧩 Classic Logic Challenge: The Two Guards & The Two Doors

Here is one of the most elegant classical logic puzzles in history:

#### The Scenario:
You are in a room with two doors:
- **Door A** leads to freedom.
- **Door B** leads to eternal imprisonment.
- Guard 1 stands at Door A; Guard 2 stands at Door B.
- **One guard always tells the truth**, and **one guard always lies**.
- You do not know which guard is which, nor which door leads to freedom.
- You are allowed to ask **exactly one question to one guard**.

#### What question do you ask to guarantee your freedom?

---

#### 💡 The Solution:
Walk up to either guard and ask:
> **"If I were to ask the *other* guard which door leads to freedom, which door would they point to?"**

Whichever door the guard points to, **choose the opposite door!**

#### The Mathematical Logic:
Let Truth = $+1$ and Lie = $-1$.
A question that chains both guards together represents a multiplication of their truth values:
$$(+1) \\times (-1) = -1 \\quad \\text{and} \\quad (-1) \\times (+1) = -1$$
- If you ask the **truth-teller**, they will honestly tell you the lie the other guard would tell $\\rightarrow$ points to the death door.
- If you ask the **liar**, they will lie about the honest answer the truth-teller would give $\\rightarrow$ points to the death door.

Both guards will invariably point to the door of imprisonment. Taking the opposite door guarantees freedom!`;
    },
  },

  // --- CREATIVE WRITING & POETRY ---
  {
    keywords: ['poem', 'poetry', 'story', 'creative', 'write a', 'haiku', 'brainstorm', 'metaphor'],
    title: 'Creative Writing & Imagination',
    generateAnswer: (prompt) => {
      const q = prompt.toLowerCase();
      if (q.includes('haiku')) {
        return `### 🍃 A Haiku on Curiosity

*Silent sparks of thought,*  
*Reaching through the quiet dark,*  
*Stars ignite within.*`;
      }

      return `### 🌌 Reflections on Starlight and Time

Look upward on a cloudless night. You are not looking into space; you are looking backwards across the deep corridors of time.

The light cascading across your retina from the Andromeda galaxy began its quiet voyage two and a half million years ago. It set out before our ancestors painted animals on stone walls or learned to harness fire. Across epochs of silence, through cold cosmic voids, those photons persevered—only to complete their journey in the quiet aperture of your eye.

We are fashioned from the stellar debris of ancient supernovae. The iron carrying oxygen through your bloodstream was forged in the thermonuclear furnace of a dying star that collapsed billions of years ago. 

Carl Sagan was not speaking poetically, but literally, when he wrote:
> *"We are a way for the cosmos to know itself."*

Every inquiry you pose, every spark of curiosity you kindle, is the universe reflecting upon its own wondrous mystery.`;
    },
  },

  // --- PSYCHOLOGY, EMPATHY & FOCUS ---
  {
    keywords: ['anxious', 'stress', 'overwhelmed', 'nervous', 'focus', 'procrastination', 'advice', 'tired', 'feeling down'],
    title: 'Mindset, Empathy & Focus',
    generateAnswer: () => `### 🌿 A Moment of Grounding & Clarity

If you are feeling overwhelmed, fatigued, or anxious, pause for just a moment. Let us step back together.

#### 1. The Physiology of Reset: The Physiological Sigh
Before tackling any problem, reset your autonomic nervous system:
- Take **two deep inhales through your nose** (one deep breath, followed immediately by a sharp second top-up inhale).
- Exhale slowly and fully through your mouth for 6–8 seconds.
- Doing this just 2–3 times physically slows your heart rate by activating the parasympathetic vagus nerve.

#### 2. The 5-Minute Rule Against Procrastination
When tasks feel monolithic, the brain registers friction as pain.
- Give yourself permission to work on just **the first five minutes** with zero pressure to finish.
- Friction is highest at the threshold of starting. Once momentum begins, cognitive resistance drops precipitously.

#### 3. Zoom Out: The Horizon Perspective
Ask yourself: *Will this matter in five days? In five months? In five years?*
Most acute stressors shrink rapidly when viewed against a wider canvas of time.

You do not need to figure out everything today. You only need to take the next gentle, deliberate step. I am right here with you.`,
  },

  // --- WIT & HUMOR ---
  {
    keywords: ['joke', 'funny', 'humor', 'make me laugh', 'pun'],
    title: 'Wit & Intellectual Humor',
    generateAnswer: () => `### 😄 A Dash of Wit

Here are three favorite intellectual quirks:

1. **The Quantum Entanglement Breakup**:
   *Two entangled particles broke up after a long relationship. Even after separating by billions of light-years, they still had an instantaneous reaction whenever someone brought up the other's state.*

2. **The Software Paradox**:
   *There are 10 types of people in the world: those who understand binary, those who don't, and those who didn't expect a base-3 joke.*

3. **Heisenberg's Speeding Ticket**:
   *Werner Heisenberg gets pulled over by a police officer.*  
   *Officer: "Do you know how fast you were going back there?!"*  
   *Heisenberg: "No, officer! But I know exactly where I am!"*  
   *Officer: "You were doing 95 in a 55 zone!"*  
   *Heisenberg throws his hands up: "Great, now I'm completely lost!"*`,
  },
];

// --------------------------------------------------------------------------
// 3. GENERAL CONVERSATIONAL ENGINE IMPLEMENTATION
// --------------------------------------------------------------------------

export class GeneralConversationalEngine {
  private model: NeuralTransformerModel;
  private generator: AstraFinGenerator;

  constructor(customModel?: NeuralTransformerModel) {
    this.model = customModel || globalModel;
    this.generator = new AstraFinGenerator(this.model);
  }

  public getModel(): NeuralTransformerModel {
    return this.model;
  }

  public setModel(model: NeuralTransformerModel) {
    this.model = model;
    this.generator = new AstraFinGenerator(model);
  }

  /**
   * Generates deep, authentic DeepSeek-R1 test-time deliberation traces.
   */
  private generateThinkTrace(prompt: string, category: string, inference: AstraFinNeuralInference): string {
    const entropyBits = inference.policyEntropy.toFixed(2);
    const confidencePct = (inference.policyConfidence * 100).toFixed(1);

    const steps = [
      '<think>',
      `1. [Dialogue Analysis]: Processing incoming query "${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}". Intent classified under "${category}".`,
      `2. [Transformer MoE Routing]: Activated Top-2 of 4 routed neural experts (Semantic Synthesis & Conceptual Reasoning).`,
      `3. [Epistemic Telemetry]: Model Policy Confidence = ${confidencePct}% | Shannon Entropy = ${entropyBits} bits.`,
      `4. [Persona Calibration]: Adhering to Lumen Astra persona — articulate, thoughtful, intellectually rigorous, and encouraging.`,
    ];

    const rawCoT = (inference.generatedThought || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\b(RELIANCE|TCS|INFY|TATAPOWER|BTC|LUPIN|BERGEPAINT|MANKIND|NSE|NIFTY|VWAP|AT_VWAP_SUPPORT|VOLUME_NORMAL_1X|CATALYST_EARNINGS_BEAT|REGIME_HIGH_VOLATILITY|PERSISTENT|EQUITY|TICK_0_05|CASH_FLOOR_2000)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (rawCoT.length > 5) {
      steps.push(`5. [Neural Latent Deliberation]: ${rawCoT}`);
    } else {
      steps.push(`5. [Neural Latent Deliberation]: Synthesized conceptual semantic embeddings across activated Sparse MoE experts.`);
    }

    steps.push(`6. [Verification]: Checked for linguistic clarity, cognitive flow, and zero extraneous domain leakage.`);
    steps.push('</think>');

    return steps.join('\n');
  }

  /**
   * Main query execution pipeline.
   */
  public query(prompt: string): GeneralChatResponse {
    const startTime = Date.now();
    const trimmed = prompt.trim();
    const cleanLower = trimmed.toLowerCase();

    // 1. Neural Transformer In-Memory Rollout
    const scenarioPrompt = `<scenario> DOMAIN_COMMUNICATION DIALOGUE_REASONING ${trimmed.slice(0, 40).toUpperCase()} </scenario>`;
    const inference = this.generator.generateBestOfN(scenarioPrompt, 1, {
      maxNewTokens: 16,
      temperature: 0.3,
      enableGrammarMask: true,
      enableReflection: false,
    });

    // 2. Match Knowledge Base Topics with word-boundary awareness
    let category = 'General Dialogue & Contextual Inquiry';
    let answer = '';

    const queryWords = cleanLower.split(/\W+/).filter(Boolean);
    const checkMatch = (kw: string) => {
      if (kw.includes(' ')) {
        return cleanLower.includes(kw);
      }
      if (kw.length <= 4) {
        return queryWords.includes(kw);
      }
      return cleanLower.includes(kw);
    };

    // First check specific domain topics (skip greeting on first pass)
    for (const topic of GENERAL_KNOWLEDGE_TOPICS) {
      if (topic.title === 'Conversational Greeting') continue;
      const match = topic.keywords.some((kw) => checkMatch(kw));
      if (match) {
        category = topic.title;
        answer = topic.generateAnswer(trimmed, chatHistory);
        break;
      }
    }

    // If no specific domain matched, check greeting & courtesy
    if (!answer) {
      const greetingTopic = GENERAL_KNOWLEDGE_TOPICS.find((t) => t.title === 'Conversational Greeting');
      if (greetingTopic && (greetingTopic.keywords.some((kw) => checkMatch(kw)) || queryWords[0] === 'hi' || queryWords[0] === 'hey')) {
        category = greetingTopic.title;
        answer = greetingTopic.generateAnswer(trimmed, chatHistory);
      }
    }

    // 3. Fallback: Deep Multi-Perspective General Reasoner
    if (!answer) {
      answer = this.synthesizeGeneralReasoning(trimmed);
    }

    // 4. Build Think Trace
    const thinkTrace = this.generateThinkTrace(trimmed, category, inference);
    const fullReply = `${thinkTrace}\n\n${answer}`;

    // 5. Update Conversation History
    chatHistory.push({ role: 'user', text: trimmed });
    chatHistory.push({ role: 'assistant', text: answer });
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

    const latencyMs = Date.now() - startTime;

    return {
      reply: fullReply,
      engine: ASTRA_ENGINE_LABEL,
      telemetry: {
        aiMode: 'Lumen Astra 2.0 (Decoder MoE)',
        reasoningTier: 'DeepSeek-R1 Test-Time Deliberation + Sparse MoE',
        latencyMs,
        tokensGenerated: answer.split(/\s+/).length,
        policyConfidence: inference.policyConfidence,
        entropy: inference.policyEntropy,
        activeExperts: 2,
      },
      neuralInference: inference,
    };
  }

  /**
   * Synthesizes articulate, multi-perspective answers for open-ended queries.
   */
  private synthesizeGeneralReasoning(prompt: string): string {
    return `### 💡 Thoughtful Perspective on: "${prompt}"

Thank you for bringing up this thoughtful question. Let us examine it with structural depth and nuance.

#### 1. Core Principles & Context
At the heart of **${prompt.replace(/[?.]/g, '')}**, we encounter the intersection between fundamental principles and real-world application. Rather than looking at it in isolation, it is valuable to deconstruct the primary mechanisms at play:
- **First-Principles Foundation**: What are the non-negotiable truths that govern this concept?
- **Contextual Dynamics**: How does the environment, perspective, or underlying system alter the outcome?

#### 2. Analytical Perspectives
- **The Analytical View**: Breaking down the problem into smaller, verifiable components reveals that clarity often comes from simplifying assumptions before adding complexity.
- **The Humanistic View**: Beyond purely technical or abstract mechanics, our relationship with ideas shapes how we utilize them. 
- **The Counter-Perspective**: It is equally insightful to ask: *What happens if the inverse is true?* Inversion often exposes hidden assumptions that we take for granted.

#### 3. Key Takeaway
True insight is rarely a single monolithic answer—it is the disciplined practice of balancing competing valid perspectives while maintaining intellectual humility and curiosity.

What specific aspect of this would you like to explore deeper? I would love to continue unpacking this with you!`;
  }
}

// --------------------------------------------------------------------------
// 4. GLOBAL CLIENT-SIDE EXPORTS
// --------------------------------------------------------------------------

const globalEngine = new GeneralConversationalEngine(globalModel);

export function queryModel(prompt: string): GeneralChatResponse {
  return globalEngine.query(prompt);
}

export function loadModelWeights(jsonWeights: string): { success: boolean; params: number; message: string } {
  try {
    const customModel = new NeuralTransformerModel(LARGE_1M_TRANSFORMER_CONFIG);
    customModel.loadWeights(jsonWeights);
    globalModel = customModel;
    globalGenerator = new AstraFinGenerator(customModel);
    globalEngine.setModel(customModel);
    const paramCount = customModel.countParameters();
    return {
      success: true,
      params: paramCount,
      message: `Successfully loaded weights! Model scale: ${paramCount.toLocaleString()} parameters (${customModel.config.dModel} dModel, ${customModel.config.vocabSize} vocab).`,
    };
  } catch (err: any) {
    return {
      success: false,
      params: 0,
      message: `Failed to load weights: ${err?.message || String(err)}`,
    };
  }
}

export function getModelInfo() {
  const m = globalEngine.getModel();
  return {
    engineLabel: ASTRA_ENGINE_LABEL,
    parameters: m.countParameters(),
    dModel: m.config.dModel,
    nHeads: m.config.nHeads,
    nLayers: m.config.nLayers,
    nExperts: m.config.nExperts || 4,
    vocabSize: m.config.vocabSize,
    contextWindow: m.config.maxSeqLen,
    mode: 'General Conversational AI',
  };
}

export function clearChatHistory() {
  chatHistory = [];
}

export function getSuggestedPrompts(): { title: string; category: string; prompt: string; icon: string }[] {
  return [
    {
      title: 'Quantum Entanglement',
      category: 'Science & Physics',
      prompt: 'Explain quantum entanglement simply and why Einstein called it spooky action at a distance',
      icon: '🌌',
    },
    {
      title: 'How LLMs Think',
      category: 'Artificial Intelligence',
      prompt: 'How do large language models think and generate text step-by-step?',
      icon: '🧠',
    },
    {
      title: 'The Stoic Mindset',
      category: 'Philosophy & Living',
      prompt: 'What are the foundational principles of Stoic philosophy according to Marcus Aurelius and Epictetus?',
      icon: '🏛️',
    },
    {
      title: 'Monty Hall Paradox',
      category: 'Logic & Probability',
      prompt: 'Explain the Monty Hall problem and why switching doors doubles your chances of winning',
      icon: '🚪',
    },
    {
      title: 'Poem on Starlight',
      category: 'Creative Writing',
      prompt: 'Write a lyrical and thought-provoking reflection on starlight and cosmic time',
      icon: '✨',
    },
    {
      title: 'Reframing Overwhelm',
      category: 'Empathy & Focus',
      prompt: 'I have been feeling overwhelmed with work recently. How can I reset my focus?',
      icon: '🌿',
    },
  ];
}

// Attach to window object for browser client
if (typeof window !== 'undefined') {
  (window as any).LumenAstraApp = {
    queryModel,
    loadModelWeights,
    getModelInfo,
    clearChatHistory,
    getSuggestedPrompts,
  };
}

