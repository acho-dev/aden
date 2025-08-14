/**
 * Flexible keyword matching utility that uses multiple similarity algorithms
 * for more robust matching of business keywords, handling typos, variations, and related terms
 */

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Edit distance
 */
function levenshteinDistance(str1, str2) {
  const matrix = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + substitutionCost // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Calculate Jaccard similarity between two strings based on character overlap
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score (0-1)
 */
function jaccardSimilarity(str1, str2) {
  const set1 = new Set(str1.toLowerCase().split(""));
  const set2 = new Set(str2.toLowerCase().split(""));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

/**
 * Calculate substring/contains scoring with position weighting
 * @param {string} keyword - Keyword to search for
 * @param {string} text - Text to search in
 * @returns {number} - Score (0-1)
 */
function substringScore(keyword, text) {
  const textLower = text.toLowerCase();
  const keywordLower = keyword.toLowerCase();

  if (textLower.includes(keywordLower)) {
    const index = textLower.indexOf(keywordLower);
    const wordBoundary =
      /\b/.test(textLower[index - 1] || " ") && /\b/.test(textLower[index + keyword.length] || " ");
    return wordBoundary ? 1.0 : 0.8; // Full word match vs partial
  }
  return 0;
}

/**
 * Perform fuzzy matching with configurable similarity algorithms
 * @param {string} keyword - Keyword to match
 * @param {string} text - Text to search in
 * @param {Object} options - Configuration options
 * @returns {number} - Match score (0-1)
 */
function fuzzyMatch(keyword, text, options = {}) {
  const {
    exactWeight = 0.4,
    distanceWeight = 0.3,
    jaccardWeight = 0.2,
    substringWeight = 0.1,
    distanceThreshold = 0.7,
    jaccardThreshold = 0.5,
  } = options;

  const words = text.toLowerCase().split(/\s+/);
  let bestScore = 0;

  for (const word of words) {
    let score = 0;

    // Exact match (highest priority)
    if (word === keyword.toLowerCase()) {
      return 1.0;
    }

    // Substring match
    const subScore = substringScore(keyword, word);
    if (subScore > 0) {
      score += subScore * substringWeight;
    }

    // Levenshtein distance similarity
    const distance = levenshteinDistance(keyword.toLowerCase(), word);
    const maxLen = Math.max(keyword.length, word.length);
    const distanceSimilarity = 1 - distance / maxLen;
    if (distanceSimilarity >= distanceThreshold) {
      score += distanceSimilarity * distanceWeight;
    }

    // Jaccard similarity
    const jaccardSim = jaccardSimilarity(keyword, word);
    if (jaccardSim >= jaccardThreshold) {
      score += jaccardSim * jaccardWeight;
    }

    // Exact match weight
    score += exactWeight * (word === keyword.toLowerCase() ? 1 : 0);

    bestScore = Math.max(bestScore, score);
  }

  return bestScore;
}

/**
 * Match keywords against text using flexible similarity algorithms
 * @param {string} text - Text to analyze
 * @param {string[]} keywords - Keywords to match
 * @param {Object} options - Configuration options
 * @returns {Object} - Match results with scores and details
 */
function matchKeywords(text, keywords, options = {}) {
  const threshold = options.threshold || 0.6;
  const matches = [];

  for (const keyword of keywords) {
    const score = fuzzyMatch(keyword, text, options);
    if (score >= threshold) {
      matches.push({
        keyword,
        score,
        matched: true,
      });
    }
  }

  return {
    hasMatches: matches.length > 0,
    matches,
    bestMatch:
      matches.length > 0
        ? matches.reduce((best, current) => (current.score > best.score ? current : best))
        : null,
    totalMatches: matches.length,
  };
}

/**
 * Create a keyword matcher with predefined business keywords
 * @param {Object} options - Configuration options
 * @returns {Object} - Matcher functions
 */
function createBusinessKeywordMatcher(options = {}) {
  const defaultBusinessKeywords = [
    // Core business entities
    "our",
    "company",
    "deals",
    "customers",
    "clients",
    "contacts",
    "employees",
    "sales",
    "revenue",
    "contract",
    "contracts",
    "engagements",
    "meetings",
    "projects",
    "database",
    "records",
    "data",
    "reports",
    "analytics",

    // Financial and business metrics keywords
    "margin",
    "margins",
    "profit",
    "profits",
    "cost",
    "costs",
    "expense",
    "expenses",
    "gross",
    "net",
    "total",
    "sum",
    "budget",
    "budgets",
    "forecast",
    "forecasts",
    "income",
    "earnings",
    "billing",
    "invoices",
    "payments",
    "receivables",
    "roi",
    "return",
    "investment",
    "cash",
    "flow",
    "financial",
    "finance",
    "accounting",
    "bookkeeping",
    "taxes",
    "tax",
    "deductions",
    "write-offs",

    // Time-related keywords (very liberal)
    "latest",
    "recent",
    "current",
    "last",
    "past",
    "previous",
    "yesterday",
    "today",
    "tomorrow",
    "week",
    "weeks",
    "month",
    "months",
    "year",
    "years",
    "quarter",
    "quarters",
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "annual",
    "12",
    "6",
    "3",
    "90",
    "30",
    "days",
    "period",
    "since",
    "until",
    "through",
    "now",
    "currently",
    "this week",
    "this month",
    "this year",
    "ongoing",
    "active",
    "pending",
    "completed",
    "in progress",
    "scheduled",
    "planned",

    // Action/query keywords (very broad)
    "find",
    "search",
    "show",
    "show me",
    "tell me",
    "tell me about",
    "give me",
    "what is",
    "who is",
    "how many",
    "how much",
    "list",
    "get",
    "retrieve",
    "display",
    "present",
    "provide",
    "fetch",
    "pull",
    "extract",
    "export",
    "calculate",
    "compute",
    "determine",
    "identify",
    "locate",
    "discover",

    // Visualization and analysis
    "campaign",
    "campaigns",
    "chart",
    "charts",
    "graph",
    "graphs",
    "plot",
    "plots",
    "visualize",
    "visualization",
    "analyze",
    "analysis",
    "size",
    "sizes",
    "by",
    "breakdown",
    "segment",
    "segments",
    "performance",
    "metrics",
    "trend",
    "trends",
    "compare",
    "comparison",
    "versus",
    "vs",
    "against",

    // HR and team-related keywords
    "hire",
    "hiring",
    "recruit",
    "recruiting",
    "candidate",
    "candidates",
    "team",
    "teams",
    "staff",
    "staffing",
    "headcount",
    "workforce",
    "onboard",
    "onboarding",
    "training",
    "skills",
    "talent",
    "employee",

    // Work and project keywords
    "work",
    "working",
    "worked",
    "task",
    "tasks",
    "project",
    "projects",
    "assignment",
    "assignments",
    "responsibility",
    "responsibilities",
    "progress",
    "status",
    "update",
    "updates",
    "deadline",
    "deadlines",

    // Design and planning keywords
    "wireframe",
    "wireframes",
    "mockup",
    "mockups",
    "design",
    "designs",
    "prototype",
    "prototypes",
    "plan",
    "planning",
    "roadmap",
    "roadmaps",
    "strategy",
    "strategic",
    "vision",
    "goals",
    "objectives",
    "requirements",

    // Question and inquiry keywords (be very liberal)
    "who",
    "what",
    "when",
    "where",
    "why",
    "how",
    "which",
    "whose",
    "should",
    "could",
    "would",
    "can",
    "will",
    "need",
    "needs",
    "want",
    "wants",
    "tell",
    "explain",
    "describe",
    "detail",
    "information",
    "info",
    "about",

    // Numbers and quantitative terms
    "number",
    "count",
    "amount",
    "total",
    "sum",
    "average",
    "mean",
    "median",
    "maximum",
    "minimum",
    "top",
    "bottom",
    "highest",
    "lowest",
    "best",
    "worst",
    "increase",
    "decrease",
    "growth",
    "decline",
    "change",
    "difference",

    // General business operations
    "operations",
    "operational",
    "business",
    "commercial",
    "enterprise",
    "organization",
    "org",
    "department",
    "division",
    "unit",
    "group",
    "process",
    "processes",
    "procedure",
    "workflow",
    "system",
    "systems",
  ];

  const keywords = options.keywords || defaultBusinessKeywords;
  const matchOptions = {
    threshold: 0.5, // Reduced from 0.6 - more liberal matching
    exactWeight: 0.4,
    distanceWeight: 0.3,
    jaccardWeight: 0.2,
    substringWeight: 0.1,
    distanceThreshold: 0.6, // Reduced from 0.7 - catch more variations
    jaccardThreshold: 0.4, // Reduced from 0.5 - more liberal overlap matching
    ...options,
  };

  return {
    /**
     * Check if text contains business keywords
     * @param {string} text - Text to analyze
     * @returns {boolean} - Whether business keywords were found
     */
    hasBusinessKeywords: text => {
      const result = matchKeywords(text, keywords, matchOptions);
      return result.hasMatches;
    },

    /**
     * Get detailed match results
     * @param {string} text - Text to analyze
     * @returns {Object} - Detailed match results
     */
    getMatchDetails: text => {
      return matchKeywords(text, keywords, matchOptions);
    },

    /**
     * Get the best matching keyword
     * @param {string} text - Text to analyze
     * @returns {Object|null} - Best match or null
     */
    getBestMatch: text => {
      const result = matchKeywords(text, keywords, matchOptions);
      return result.bestMatch;
    },

    /**
     * Add custom keywords to the matcher
     * @param {string[]} newKeywords - Keywords to add
     */
    addKeywords: newKeywords => {
      keywords.push(...newKeywords);
    },
  };
}

export {
  levenshteinDistance,
  jaccardSimilarity,
  substringScore,
  fuzzyMatch,
  matchKeywords,
  createBusinessKeywordMatcher,
};
