// Test cases configuration for benchmarking schema enhancements

export default [
  // Case 1: Revenue and Financial Analysis
  {
    name: "Revenue_Financial_Analysis",
    question: "Calculate our ARR",
    schemas: [
      {
        name: "original",
        file: "schema_graph_original.json",
        description: "Base schema with single knowledge node about ARR excluding churned revenue",
      },
      {
        name: "enhanced_consolidated",
        file: "schema_graph_consolidated.json",
        description:
          "Consolidated schema with all enhancements: ARR calculation rules, churned revenue status, team info, sales pipeline knowledge, and customer relationship management",
      },
    ],
  },

  // Case 2: Work Assignment and Project Management
  {
    name: "Work_Assignment_Projects",
    question:
      "What are the tickets/deal Frank (any engineer or salesperson) is working on right now?",
    schemas: [
      {
        name: "original",
        file: "schema_graph_original.json",
        description: "Base schema without person-role-work assignment knowledge",
      },
      {
        name: "enhanced_consolidated",
        file: "schema_graph_consolidated.json",
        description:
          "Consolidated schema with all enhancements: team member info, employee roles, work assignments, and project tracking knowledge",
      },
    ],
  },

  // Case 3: Sales and Lead Management
  {
    name: "Sales_Lead_Management",
    question: "Among the recent leads, which one is the most promising to close?",
    schemas: [
      {
        name: "original",
        file: "schema_graph_original.json",
        description: "Base schema without lead scoring and qualification knowledge",
      },
      {
        name: "enhanced_consolidated",
        file: "schema_graph_consolidated.json",
        description:
          "Consolidated schema with all enhancements: lead qualification criteria, scoring algorithms, sales pipeline knowledge, and deal closing info",
      },
    ],
  },

  // Case 4: Customer Relationship and Communications
  {
    name: "Customer_Communications",
    question: "What is the action list for us from the conversation with Sang?",
    schemas: [
      {
        name: "original",
        file: "schema_graph_original.json",
        description: "Base schema without conversation analysis and relationship management",
      },
      {
        name: "enhanced_consolidated",
        file: "schema_graph_consolidated.json",
        description:
          "Consolidated schema with all enhancements: customer information location, communication preferences, conversation parsing, and action item extraction",
      },
    ],
  },

  // Additional test questions for each case
  {
    name: "Revenue_Financial_Analysis_Alt",
    question: "What are the recent invoices I send to Sang and if they're delayed",
    schemas: [
      {
        name: "original",
        file: "schema_graph_original.json",
        description: "Base schema without invoice tracking and payment status knowledge",
      },
      {
        name: "enhanced_consolidated",
        file: "schema_graph_consolidated.json",
        description:
          "Consolidated schema with all enhancements: customer information, ARR calculation rules, and comprehensive business intelligence",
      },
    ],
  },

  {
    name: "Work_Assignment_Projects_Alt",
    question: "Which project is the most likely to be delayed?",
    schemas: [
      {
        name: "original",
        file: "schema_graph_original.json",
        description: "Base schema without project risk assessment knowledge",
      },
      {
        name: "enhanced_consolidated",
        file: "schema_graph_consolidated.json",
        description:
          "Consolidated schema with all enhancements: team member info, project timeline indicators, and comprehensive project management knowledge",
      },
    ],
  },

  {
    name: "Sales_Lead_Management_Alt",
    question: "Which candidate is the best fit at selling enterprise software deals?",
    schemas: [
      {
        name: "original",
        file: "schema_graph_original.json",
        description: "Base schema without interview content and experience mapping",
      },
      {
        name: "enhanced_consolidated",
        file: "schema_graph_consolidated.json",
        description:
          "Consolidated schema with all enhancements: recruiting info, sales lead knowledge, candidate experience mapping, and interview insights",
      },
    ],
  },

  {
    name: "Customer_Communications_Alt",
    question: "What do we need to follow up with Sang?",
    schemas: [
      {
        name: "original",
        file: "schema_graph_original.json",
        description: "Base schema without follow-up tracking and relationship context",
      },
      {
        name: "enhanced_consolidated",
        file: "schema_graph_consolidated.json",
        description:
          "Consolidated schema with all enhancements: customer information, follow-up workflows, relationship management, and comprehensive customer intelligence",
      },
    ],
  },

  {
    name: "Analytics_Trends",
    question: "Show me how the user registration trend in the last month and where they come from",
    schemas: [
      {
        name: "original",
        file: "schema_graph_original.json",
        description: "Base schema without user analytics and attribution tracking",
      },
      {
        name: "enhanced_consolidated",
        file: "schema_graph_consolidated.json",
        description:
          "Consolidated schema with all enhancements: sales pipeline knowledge, lead source information, user acquisition analytics, and comprehensive business intelligence",
      },
    ],
  },
];
