/**
 * Goal-Aware Dynamic Task Generator
 * 
 * This module provides intelligent task generation that understands:
 * 1. The final goal/objective
 * 2. Current progress toward that goal
 * 3. Gaps between current state and desired state
 * 4. Strategic next steps to achieve the goal
 */

export class GoalAwareTaskGenerator {
  constructor(context) {
    this.context = context;
  }

  /**
   * Generate new tasks based on gap analysis between current progress and final goal
   * @param {Object} params - Parameters for task generation
   * @returns {Array} Array of new tasks to execute
   */
  async generateTasksFromGapAnalysis(params) {
    const {
      originalGoal,        // The user's original request/goal
      completedTasks,      // Tasks that have been completed
      currentState,        // Current state of the project/workspace
      existingPlan,        // The original plan
      maxNewTasks = 5      // Maximum number of new tasks to generate
    } = params;

    try {
      // Build comprehensive context about progress
      const progressContext = this.analyzeProgress(completedTasks, currentState, originalGoal);
      
      // Use LLM to intelligently identify gaps and generate tasks
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildGapAnalysisPrompt(
        originalGoal,
        progressContext,
        completedTasks,
        currentState,
        existingPlan
      );

      const response = await this.context.llmClient.callProviderAPI(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        [],
        { 
          timeout: 30000,
          maxTokens: 2000
        }
      );

      const responseText = this.context.llmClient.extractTextResponse(response);
      return this.parseTasksFromResponse(responseText, originalGoal);

    } catch (error) {
      console.error('❌ Goal-aware task generation failed:', error.message);
      return [];
    }
  }

  /**
   * Analyze current progress toward the goal
   */
  analyzeProgress(completedTasks, currentState, originalGoal) {
    const analysis = {
      tasksCompleted: completedTasks.length,
      filesCreated: currentState.files || [],
      directoriesCreated: currentState.directories || [],
      successfulOperations: [],
      failedOperations: [],
      partialImplementations: [],
      missingComponents: []
    };

    // Analyze completed tasks for successes and failures
    completedTasks.forEach(task => {
      if (task.result?.toolResults) {
        const hasErrors = task.result.toolResults.some(r => r.is_error);
        const hasData = task.result.toolResults.some(r => 
          r.content && !r.content.includes('empty') && !r.content.includes('[]')
        );

        if (hasErrors) {
          analysis.failedOperations.push({
            task: task.description,
            reason: 'Tool execution errors'
          });
        } else if (hasData) {
          analysis.successfulOperations.push(task.description);
        } else {
          analysis.partialImplementations.push({
            task: task.description,
            issue: 'No meaningful data produced'
          });
        }
      }
    });

    // Check for common missing components based on goal keywords
    if (originalGoal.toLowerCase().includes('dashboard') || 
        originalGoal.toLowerCase().includes('web app')) {
      // Check for essential web app files
      const essentialFiles = ['index.html', 'package.json', 'server.js', 'README.md'];
      essentialFiles.forEach(file => {
        if (!analysis.filesCreated.some(f => f.includes(file))) {
          analysis.missingComponents.push(file);
        }
      });
    }

    if (originalGoal.toLowerCase().includes('api') || 
        originalGoal.toLowerCase().includes('backend')) {
      // Check for API essentials
      const apiEssentials = ['routes', 'controllers', 'middleware', 'config'];
      apiEssentials.forEach(component => {
        if (!analysis.directoriesCreated.some(d => d.includes(component)) &&
            !analysis.filesCreated.some(f => f.includes(component))) {
          analysis.missingComponents.push(component);
        }
      });
    }

    return analysis;
  }

  /**
   * Build system prompt for goal-aware task generation
   */
  buildSystemPrompt() {
    return `You are an intelligent project manager and task generator. Your role is to:

1. Understand the final goal/objective
2. Assess current progress and what has been completed
3. Identify gaps between current state and desired end state
4. Generate strategic tasks that will move the project toward completion

TASK GENERATION PRINCIPLES:
- Focus on achieving the end goal, not just fixing immediate problems
- Consider the big picture and overall project architecture
- Generate tasks that build on existing work
- Ensure new tasks complement completed work
- Prioritize tasks that unlock further progress
- Include verification and testing tasks when appropriate

TASK FORMAT:
Each task should be specific, actionable, and goal-oriented with:
- Clear description of what needs to be done
- Specific tools required
- Expected outcome that contributes to the goal
- Dependencies on other tasks (if any)
- Priority based on importance to goal achievement`;
  }

  /**
   * Build prompt for gap analysis
   */
  buildGapAnalysisPrompt(originalGoal, progressContext, completedTasks, currentState, existingPlan) {
    return `GOAL-AWARE TASK GENERATION

ORIGINAL GOAL:
"${originalGoal}"

CURRENT PROGRESS ANALYSIS:
- Tasks Completed: ${progressContext.tasksCompleted}
- Files Created: ${progressContext.filesCreated.join(', ') || 'None'}
- Successful Operations: ${progressContext.successfulOperations.join(', ') || 'None'}
- Failed/Partial: ${progressContext.failedOperations.length + progressContext.partialImplementations.length} tasks
- Missing Components: ${progressContext.missingComponents.join(', ') || 'None identified'}

COMPLETED TASKS:
${completedTasks.map(t => `✓ ${t.description}`).join('\n')}

CURRENT PROJECT STATE:
Files: ${currentState.files?.length || 0}
Directories: ${currentState.directories?.length || 0}
${currentState.verified ? '✓ Structure verified' : '⚠️ Structure not verified'}

ORIGINAL PLAN SUMMARY:
${existingPlan?.tasks?.map(t => `- ${t.description} (${t.priority})`).join('\n') || 'No original plan available'}

GAP ANALYSIS REQUIRED:
1. What key components are missing to achieve "${originalGoal}"?
2. What completed tasks need follow-up or enhancement?
3. What new tasks would best move us toward the goal?
4. What verification/testing tasks ensure quality?
5. What integration tasks connect the components?

Generate UP TO 5 NEW TASKS that will most effectively close the gap between current state and the goal.
Focus on high-impact tasks that unlock further progress.

Return as JSON array:
[
  {
    "id": "goal-task-1",
    "description": "specific task description",
    "priority": "high|medium|low",
    "toolsRequired": ["tool1", "tool2"],
    "expectedOutcome": "how this moves toward the goal",
    "dependencies": ["task-id-if-any"],
    "rationale": "why this task is critical for the goal"
  }
]

If the goal appears to be achieved, return an empty array.`;
  }

  /**
   * Parse tasks from LLM response
   */
  parseTasksFromResponse(responseText, originalGoal) {
    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn('No JSON array found in response');
        return [];
      }

      const tasks = JSON.parse(jsonMatch[0]);
      
      // Enhance tasks with metadata
      return tasks.map((task, index) => ({
        ...task,
        id: task.id || `goal-aware-${Date.now()}-${index}`,
        dynamicallyGenerated: true,
        generationType: 'goal-aware',
        goalContext: originalGoal,
        priority: task.priority || 'medium',
        toolsRequired: task.toolsRequired || [],
        dependencies: task.dependencies || [],
        executionContext: {
          adaptable: true,
          rewriteCount: 0
        }
      }));

    } catch (error) {
      console.error('Failed to parse goal-aware tasks:', error.message);
      return [];
    }
  }

  /**
   * Check if goal has been achieved based on current state
   */
  isGoalAchieved(originalGoal, currentState, completedTasks) {
    // Simple heuristic checks - can be enhanced with LLM analysis
    const goalKeywords = originalGoal.toLowerCase().split(/\s+/);
    
    // Check if key deliverables exist
    const hasRequiredFiles = goalKeywords.some(keyword => {
      if (keyword.includes('.html') || keyword.includes('.js') || keyword.includes('.json')) {
        return currentState.files?.some(f => f.toLowerCase().includes(keyword));
      }
      return true;
    });

    // Check task completion rate
    const completionRate = completedTasks.filter(t => 
      t.result && !t.result.toolResults?.some(r => r.is_error)
    ).length / Math.max(completedTasks.length, 1);

    // Check for verification tasks
    const hasVerification = completedTasks.some(t => {
      const description = t.task?.description || t.description || '';
      return description.toLowerCase().includes('test') ||
             description.toLowerCase().includes('verify') ||
             description.toLowerCase().includes('validate');
    });

    return hasRequiredFiles && completionRate > 0.8 && hasVerification;
  }

  /**
   * Generate verification tasks for completed work
   */
  generateVerificationTasks(completedWork) {
    const verificationTasks = [];

    // Check if main functionality needs testing
    if (completedWork.files?.some(f => f.includes('.js') || f.includes('.py'))) {
      verificationTasks.push({
        id: `verify-${Date.now()}-1`,
        description: 'Run and test main application functionality',
        priority: 'high',
        toolsRequired: ['execute_command', 'read_file'],
        expectedOutcome: 'Confirm application runs without errors',
        rationale: 'Ensure the implementation meets the goal requirements'
      });
    }

    // Check if documentation exists
    if (!completedWork.files?.some(f => f.toLowerCase().includes('readme'))) {
      verificationTasks.push({
        id: `verify-${Date.now()}-2`,
        description: 'Create README with setup and usage instructions',
        priority: 'medium',
        toolsRequired: ['write_file'],
        expectedOutcome: 'Complete documentation for the project',
        rationale: 'Documentation ensures the goal is achievable by others'
      });
    }

    return verificationTasks;
  }
}