import fs from "fs/promises";
import path from "path";
import os from "os";

export class MemoryManager {
  constructor(baseDir = null) {
    this.baseDir = baseDir || path.join(os.homedir(), ".aden");
    this.projectsDir = path.join(this.baseDir, "projects");
    this.knowledgeDir = path.join(this.baseDir, "knowledge_base");
    this.sessionsDir = path.join(this.baseDir, "sessions");
    this.memoryIndex = path.join(this.baseDir, "memory_index.json");

    this.initializeDirectories();
  }

  async initializeDirectories() {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      await fs.mkdir(this.projectsDir, { recursive: true });
      await fs.mkdir(this.knowledgeDir, { recursive: true });
      await fs.mkdir(this.sessionsDir, { recursive: true });

      // Initialize memory index if it doesn't exist
      try {
        await fs.access(this.memoryIndex);
      } catch {
        await this.saveMemoryIndex({
          projects: {},
          knowledge_domains: {},
          sessions: {},
          created: new Date().toISOString(),
          version: "1.0.0",
        });
      }
    } catch (error) {
      console.warn("Failed to initialize memory directories:", error.message);
    }
  }

  async saveMemoryIndex(index) {
    await fs.writeFile(this.memoryIndex, JSON.stringify(index, null, 2));
  }

  async loadMemoryIndex() {
    try {
      const content = await fs.readFile(this.memoryIndex, "utf-8");
      return JSON.parse(content);
    } catch {
      return {
        projects: {},
        knowledge_domains: {},
        sessions: {},
        created: new Date().toISOString(),
        version: "1.0.0",
      };
    }
  }

  // Project Memory Management
  async createProject(projectId, objective, metadata = {}) {
    const project = {
      id: projectId,
      objective,
      status: "active",
      created: new Date().toISOString(),
      last_active: new Date().toISOString(),
      progress: {
        research_phase: "pending",
        analysis_phase: "pending",
        implementation_phase: "pending",
        completion_phase: "pending",
      },
      tasks: [],
      key_findings: [],
      next_actions: [],
      context_summary: "",
      ...metadata,
    };

    const projectPath = path.join(this.projectsDir, `${projectId}.json`);
    await fs.writeFile(projectPath, JSON.stringify(project, null, 2));

    // Update memory index
    const index = await this.loadMemoryIndex();
    index.projects[projectId] = {
      path: projectPath,
      created: project.created,
      last_active: project.last_active,
      status: project.status,
    };
    await this.saveMemoryIndex(index);

    return project;
  }

  async getProject(projectId) {
    try {
      const projectPath = path.join(this.projectsDir, `${projectId}.json`);
      const content = await fs.readFile(projectPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async updateProject(projectId, updates) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const updatedProject = {
      ...project,
      ...updates,
      last_active: new Date().toISOString(),
    };

    const projectPath = path.join(this.projectsDir, `${projectId}.json`);
    await fs.writeFile(projectPath, JSON.stringify(updatedProject, null, 2));

    // Update index
    const index = await this.loadMemoryIndex();
    if (index.projects[projectId]) {
      index.projects[projectId].last_active = updatedProject.last_active;
      index.projects[projectId].status = updatedProject.status;
      await this.saveMemoryIndex(index);
    }

    return updatedProject;
  }

  async listProjects() {
    const index = await this.loadMemoryIndex();
    return Object.keys(index.projects).map(id => ({
      id,
      ...index.projects[id],
    }));
  }

  // Knowledge Base Management
  async storeKnowledge(domain, data, source = "user_input") {
    const knowledge = {
      domain,
      data,
      source,
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      version: 1,
    };

    const knowledgePath = path.join(this.knowledgeDir, `${domain}.json`);

    // Try to load existing knowledge to merge
    try {
      const existing = await fs.readFile(knowledgePath, "utf-8");
      const existingData = JSON.parse(existing);

      knowledge.data = { ...existingData.data, ...data };
      knowledge.version = (existingData.version || 0) + 1;
      knowledge.created = existingData.created;
    } catch {
      // New knowledge domain
    }

    await fs.writeFile(knowledgePath, JSON.stringify(knowledge, null, 2));

    // Update memory index
    const index = await this.loadMemoryIndex();
    index.knowledge_domains[domain] = {
      path: knowledgePath,
      last_updated: knowledge.last_updated,
      version: knowledge.version,
    };
    await this.saveMemoryIndex(index);

    return knowledge;
  }

  async getKnowledge(domain) {
    try {
      const knowledgePath = path.join(this.knowledgeDir, `${domain}.json`);
      const content = await fs.readFile(knowledgePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async searchKnowledge(query) {
    const index = await this.loadMemoryIndex();
    const results = [];

    for (const domain of Object.keys(index.knowledge_domains)) {
      const knowledge = await this.getKnowledge(domain);
      if (knowledge) {
        const dataStr = JSON.stringify(knowledge.data).toLowerCase();
        if (dataStr.includes(query.toLowerCase())) {
          results.push({
            domain,
            relevance: this.calculateRelevance(query, dataStr),
            last_updated: knowledge.last_updated,
            snippet: this.extractSnippet(query, dataStr),
          });
        }
      }
    }

    return results.sort((a, b) => b.relevance - a.relevance);
  }

  calculateRelevance(query, text) {
    const queryWords = query.toLowerCase().split(/\s+/);
    let score = 0;

    queryWords.forEach(word => {
      const regex = new RegExp(word, "gi");
      const matches = text.match(regex);
      if (matches) {
        score += matches.length;
      }
    });

    return score;
  }

  extractSnippet(query, text, length = 200) {
    const index = text.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return text.slice(0, length);

    const start = Math.max(0, index - 50);
    const end = Math.min(text.length, index + query.length + 150);

    return "..." + text.slice(start, end) + "...";
  }

  // Session Management
  async createSession(sessionId, objective, metadata = {}) {
    const session = {
      id: sessionId,
      objective,
      created: new Date().toISOString(),
      thinking_process: [],
      tools_used: [],
      results: {},
      lessons_learned: [],
      context: {},
      ...metadata,
    };

    const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));

    // Update memory index
    const index = await this.loadMemoryIndex();
    index.sessions[sessionId] = {
      path: sessionPath,
      created: session.created,
      objective: objective,
    };
    await this.saveMemoryIndex(index);

    return session;
  }

  async updateSession(sessionId, updates) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const updatedSession = { ...session, ...updates };
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
    await fs.writeFile(sessionPath, JSON.stringify(updatedSession, null, 2));

    return updatedSession;
  }

  async getSession(sessionId) {
    try {
      const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
      const content = await fs.readFile(sessionPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  // High-level Memory Operations
  async recall(query) {
    const results = {
      projects: [],
      knowledge: [],
      sessions: [],
    };

    // Search projects
    const projects = await this.listProjects();
    projects.forEach(project => {
      if (
        project.id.toLowerCase().includes(query.toLowerCase()) ||
        (project.objective && project.objective.toLowerCase().includes(query.toLowerCase()))
      ) {
        results.projects.push(project);
      }
    });

    // Search knowledge base
    results.knowledge = await this.searchKnowledge(query);

    // Search sessions
    const index = await this.loadMemoryIndex();
    for (const sessionId of Object.keys(index.sessions)) {
      const sessionInfo = index.sessions[sessionId];
      if (
        sessionInfo.objective &&
        sessionInfo.objective.toLowerCase().includes(query.toLowerCase())
      ) {
        results.sessions.push({
          id: sessionId,
          ...sessionInfo,
        });
      }
    }

    return results;
  }

  async storeInsight(insight, context = {}) {
    const domain = context.domain || "general_insights";
    const timestamp = new Date().toISOString();

    const insightData = {
      insight,
      context,
      timestamp,
      source: "user_insight",
    };

    // Get existing insights or create new
    const existing = (await this.getKnowledge(domain)) || {
      data: { insights: [] },
    };
    existing.data.insights = existing.data.insights || [];
    existing.data.insights.push(insightData);

    await this.storeKnowledge(domain, existing.data, "insight_storage");
    return insightData;
  }

  async getRecentActivity(days = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const activity = {
      projects: [],
      knowledge_updates: [],
      sessions: [],
    };

    const index = await this.loadMemoryIndex();

    // Recent projects
    for (const [projectId, projectInfo] of Object.entries(index.projects)) {
      if (new Date(projectInfo.last_active) > cutoffDate) {
        activity.projects.push({ id: projectId, ...projectInfo });
      }
    }

    // Recent knowledge updates
    for (const [domain, knowledgeInfo] of Object.entries(index.knowledge_domains)) {
      if (new Date(knowledgeInfo.last_updated) > cutoffDate) {
        activity.knowledge_updates.push({ domain, ...knowledgeInfo });
      }
    }

    // Recent sessions
    for (const [sessionId, sessionInfo] of Object.entries(index.sessions)) {
      if (new Date(sessionInfo.created) > cutoffDate) {
        activity.sessions.push({ id: sessionId, ...sessionInfo });
      }
    }

    return activity;
  }

  // Memory Statistics
  async getMemoryStats() {
    const index = await this.loadMemoryIndex();

    return {
      total_projects: Object.keys(index.projects).length,
      total_knowledge_domains: Object.keys(index.knowledge_domains).length,
      total_sessions: Object.keys(index.sessions).length,
      memory_location: this.baseDir,
      created: index.created,
      version: index.version,
    };
  }
}
