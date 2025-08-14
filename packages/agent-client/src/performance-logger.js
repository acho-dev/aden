/**
 * Performance Logger - Tracks execution metrics and performance bottlenecks
 */
export class PerformanceLogger {
  constructor(sessionId = null) {
    this.sessionId = sessionId || `session_${Date.now()}`;
    this.metrics = {
      session_id: this.sessionId,
      start_time: Date.now(),
      end_time: null,
      total_duration_ms: null,
      
      // LLM API Performance
      llm_calls: [],
      total_llm_calls: 0,
      total_llm_time_ms: 0,
      avg_llm_response_time_ms: 0,
      system_prompt_sizes: [],
      
      // Tool Execution Performance
      tool_calls: [],
      total_tool_calls: 0,
      total_tool_time_ms: 0,
      avg_tool_execution_time_ms: 0,
      tool_success_rate: 0,
      tool_categories: {},
      
      // Schema & Context Performance
      schema_operations: [],
      total_schema_time_ms: 0,
      schema_context_size_bytes: 0,
      context_loading_time_ms: 0,
      
      // Memory Operations
      memory_operations: [],
      total_memory_time_ms: 0,
      memory_cache_hits: 0,
      memory_cache_misses: 0,
      
      // Decision Pipeline Performance
      pipeline_stages: [],
      replans_executed: 0,
      tasks_completed: 0,
      gap_analyses_performed: 0,
      
      // Resource Usage
      peak_memory_usage_mb: 0,
      concurrent_operations: 0,
      max_concurrent_operations: 0,
      
      // Optimization Metrics
      fast_decision_calls: 0,
      fast_decision_time_saved_ms: 0,
      parallel_executions: 0,
      cache_utilization_rate: 0
    };
    
    this.activeOperations = new Map();
    this.startTime = Date.now();
    
    console.log(`📊 PerformanceLogger initialized for session: ${this.sessionId}`);
  }

  // ==================== TIMING UTILITIES ====================
  
  startOperation(operationType, operationId = null, metadata = {}) {
    const id = operationId || `${operationType}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const operation = {
      id,
      type: operationType,
      start_time: Date.now(),
      metadata: { ...metadata }
    };
    
    this.activeOperations.set(id, operation);
    this.metrics.concurrent_operations++;
    this.metrics.max_concurrent_operations = Math.max(
      this.metrics.max_concurrent_operations, 
      this.metrics.concurrent_operations
    );
    
    return id;
  }
  
  endOperation(operationId, result = {}) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      console.warn(`⚠️ Performance Logger: Operation ${operationId} not found`);
      console.warn(`⚠️ Active operations: ${Array.from(this.activeOperations.keys()).join(', ')}`);
      console.warn(`⚠️ Session ID: ${this.sessionId}`);
      return null;
    }
    
    const endTime = Date.now();
    const duration = endTime - operation.start_time;
    
    operation.end_time = endTime;
    operation.duration_ms = duration;
    operation.result = result;
    
    this.activeOperations.delete(operationId);
    this.metrics.concurrent_operations--;
    
    return { ...operation, duration_ms: duration };
  }

  // ==================== LLM PERFORMANCE TRACKING ====================
  
  startLLMCall(provider, model, promptSize, metadata = {}) {
    const operationId = this.startOperation('llm_call', null, {
      provider,
      model,
      prompt_size_chars: promptSize,
      ...metadata
    });
    
    this.metrics.system_prompt_sizes.push(promptSize);
    return operationId;
  }
  
  endLLMCall(operationId, result = {}) {
    const operation = this.endOperation(operationId, result);
    if (!operation) return;
    
    this.metrics.llm_calls.push(operation);
    this.metrics.total_llm_calls++;
    this.metrics.total_llm_time_ms += operation.duration_ms;
    this.metrics.avg_llm_response_time_ms = this.metrics.total_llm_time_ms / this.metrics.total_llm_calls;
    
    console.log(`🤖 LLM Call completed: ${operation.metadata.provider}/${operation.metadata.model} - ${operation.duration_ms}ms`);
  }

  // ==================== TOOL EXECUTION TRACKING ====================
  
  startToolExecution(toolName, toolCategory = 'unknown', metadata = {}) {
    const operationId = this.startOperation('tool_execution', null, {
      tool_name: toolName,
      tool_category: toolCategory,
      ...metadata
    });
    
    // Track tool categories
    this.metrics.tool_categories[toolCategory] = (this.metrics.tool_categories[toolCategory] || 0) + 1;
    
    return operationId;
  }
  
  endToolExecution(operationId, success = true, result = {}) {
    const operation = this.endOperation(operationId, { success, ...result });
    if (!operation) return;
    
    this.metrics.tool_calls.push(operation);
    this.metrics.total_tool_calls++;
    this.metrics.total_tool_time_ms += operation.duration_ms;
    this.metrics.avg_tool_execution_time_ms = this.metrics.total_tool_time_ms / this.metrics.total_tool_calls;
    
    // Calculate success rate
    const successfulCalls = this.metrics.tool_calls.filter(call => call.result?.success !== false).length;
    this.metrics.tool_success_rate = (successfulCalls / this.metrics.total_tool_calls) * 100;
    
    const status = success ? '✅' : '❌';
    console.log(`🔧 Tool execution: ${operation.metadata.tool_name} ${status} - ${operation.duration_ms}ms`);
  }

  // ==================== SCHEMA & CONTEXT TRACKING ====================
  
  startSchemaOperation(operationType, schemaSize = 0, metadata = {}) {
    const operationId = this.startOperation('schema_operation', null, {
      operation_type: operationType,
      schema_size_bytes: schemaSize,
      ...metadata
    });
    
    this.metrics.schema_context_size_bytes = Math.max(this.metrics.schema_context_size_bytes, schemaSize);
    
    return operationId;
  }
  
  endSchemaOperation(operationId, result = {}) {
    const operation = this.endOperation(operationId, result);
    if (!operation) return;
    
    this.metrics.schema_operations.push(operation);
    this.metrics.total_schema_time_ms += operation.duration_ms;
    
    console.log(`🔍 Schema operation: ${operation.metadata.operation_type} - ${operation.duration_ms}ms`);
  }

  // ==================== MEMORY OPERATIONS TRACKING ====================
  
  startMemoryOperation(operationType, cacheHit = false, metadata = {}) {
    const operationId = this.startOperation('memory_operation', null, {
      operation_type: operationType,
      cache_hit: cacheHit,
      ...metadata
    });
    
    if (cacheHit) {
      this.metrics.memory_cache_hits++;
    } else {
      this.metrics.memory_cache_misses++;
    }
    
    return operationId;
  }
  
  endMemoryOperation(operationId, result = {}) {
    const operation = this.endOperation(operationId, result);
    if (!operation) return;
    
    this.metrics.memory_operations.push(operation);
    this.metrics.total_memory_time_ms += operation.duration_ms;
    
    const cacheStatus = operation.metadata.cache_hit ? '💾 HIT' : '🔍 MISS';
    console.log(`🧠 Memory operation: ${operation.metadata.operation_type} ${cacheStatus} - ${operation.duration_ms}ms`);
  }

  // ==================== PIPELINE STAGE TRACKING ====================
  
  startPipelineStage(stageName, metadata = {}) {
    const operationId = this.startOperation('pipeline_stage', null, {
      stage_name: stageName,
      ...metadata
    });
    
    return operationId;
  }
  
  endPipelineStage(operationId, result = {}) {
    const operation = this.endOperation(operationId, result);
    if (!operation) return;
    
    this.metrics.pipeline_stages.push(operation);
    
    console.log(`🚀 Pipeline stage: ${operation.metadata.stage_name} - ${operation.duration_ms}ms`);
  }

  // ==================== OPTIMIZATION TRACKING ====================
  
  recordFastDecision(timeSavedMs = 0) {
    this.metrics.fast_decision_calls++;
    this.metrics.fast_decision_time_saved_ms += timeSavedMs;
    
    console.log(`⚡ Fast decision used - saved ${timeSavedMs}ms (total saved: ${this.metrics.fast_decision_time_saved_ms}ms)`);
  }
  
  recordParallelExecution(operationsCount = 1) {
    this.metrics.parallel_executions += operationsCount;
    
    console.log(`🔄 Parallel execution: ${operationsCount} operations`);
  }

  // ==================== REPORTING ====================
  
  generatePerformanceReport() {
    const endTime = Date.now();
    this.metrics.end_time = endTime;
    this.metrics.total_duration_ms = endTime - this.metrics.start_time;
    
    // Calculate cache utilization
    const totalCacheOperations = this.metrics.memory_cache_hits + this.metrics.memory_cache_misses;
    this.metrics.cache_utilization_rate = totalCacheOperations > 0 
      ? (this.metrics.memory_cache_hits / totalCacheOperations) * 100 
      : 0;
    
    return {
      ...this.metrics,
      generated_at: new Date().toISOString(),
      performance_score: this.calculatePerformanceScore()
    };
  }
  
  calculatePerformanceScore() {
    let score = 100;
    
    // Penalize excessive tool calls (optimal: 3-8 tools)
    if (this.metrics.total_tool_calls > 15) {
      score -= Math.min(30, (this.metrics.total_tool_calls - 15) * 2);
    }
    
    // Penalize slow average response times (optimal: <2000ms)
    if (this.metrics.avg_llm_response_time_ms > 3000) {
      score -= Math.min(20, (this.metrics.avg_llm_response_time_ms - 3000) / 100);
    }
    
    // Penalize low tool success rate (optimal: >95%)
    if (this.metrics.tool_success_rate < 95) {
      score -= (95 - this.metrics.tool_success_rate);
    }
    
    // Reward fast decision usage
    if (this.metrics.fast_decision_calls > 0) {
      score += Math.min(10, this.metrics.fast_decision_calls * 2);
    }
    
    // Reward parallel executions
    if (this.metrics.parallel_executions > 0) {
      score += Math.min(10, this.metrics.parallel_executions);
    }
    
    // Reward good cache utilization (optimal: >80%)
    if (this.metrics.cache_utilization_rate > 80) {
      score += 5;
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  
  logPerformanceSummary() {
    const report = this.generatePerformanceReport();
    
    console.log(`\n📊 ==================== PERFORMANCE SUMMARY ====================`);
    console.log(`🎯 Session: ${this.sessionId}`);
    console.log(`⏱️  Total Duration: ${report.total_duration_ms}ms`);
    console.log(`🏆 Performance Score: ${report.performance_score}/100`);
    console.log(`\n🤖 LLM Performance:`);
    console.log(`   • Calls: ${report.total_llm_calls}`);
    console.log(`   • Total Time: ${report.total_llm_time_ms}ms`);
    console.log(`   • Avg Response: ${Math.round(report.avg_llm_response_time_ms)}ms`);
    console.log(`   • Avg Prompt Size: ${Math.round(report.system_prompt_sizes.reduce((a, b) => a + b, 0) / report.system_prompt_sizes.length || 0)} chars`);
    console.log(`\n🔧 Tool Performance:`);
    console.log(`   • Calls: ${report.total_tool_calls}`);
    console.log(`   • Total Time: ${report.total_tool_time_ms}ms`);
    console.log(`   • Avg Execution: ${Math.round(report.avg_tool_execution_time_ms)}ms`);
    console.log(`   • Success Rate: ${Math.round(report.tool_success_rate)}%`);
    console.log(`\n⚡ Optimizations:`);
    console.log(`   • Fast Decisions: ${report.fast_decision_calls}`);
    console.log(`   • Time Saved: ${report.fast_decision_time_saved_ms}ms`);
    console.log(`   • Parallel Executions: ${report.parallel_executions}`);
    console.log(`   • Cache Hit Rate: ${Math.round(report.cache_utilization_rate)}%`);
    console.log(`==============================================================\n`);
    
    return report;
  }
  
  // ==================== EXPORT ====================
  
  async exportToFile(filePath = null) {
    const report = this.generatePerformanceReport();
    const fileName = filePath || `performance_${this.sessionId}_${Date.now()}.json`;
    
    try {
      const fs = await import('fs/promises');
      await fs.writeFile(fileName, JSON.stringify(report, null, 2));
      console.log(`📁 Performance report exported to: ${fileName}`);
      return fileName;
    } catch (error) {
      console.error(`❌ Failed to export performance report: ${error.message}`);
      return null;
    }
  }
}

// Export singleton instance for easy access
let globalPerformanceLogger = null;

export function getPerformanceLogger(sessionId = null) {
  if (!globalPerformanceLogger || (sessionId && globalPerformanceLogger.sessionId !== sessionId)) {
    globalPerformanceLogger = new PerformanceLogger(sessionId);
  }
  return globalPerformanceLogger;
}

export function resetPerformanceLogger() {
  globalPerformanceLogger = null;
}