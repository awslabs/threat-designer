/**
 * Mock data service for attack tree visualization
 * Provides realistic attack tree structures for UI development and testing
 */

/**
 * Returns mock attack tree data for a given threat
 * @param {string} threatId - The ID of the threat
 * @param {string} threatName - The name of the threat
 * @returns {Object} Attack tree data with nodes and edges arrays
 */
export const getMockAttackTree = (threatId, threatName) => {
  // Use Cognito PII attack tree as default
  return getCognitoPIIAttackTree();
};

const getCognitoPIIAttackTree = () => {
  return {
    nodes: [
      // Root Goal
      { id: "1", type: "root", data: { label: "Exfiltrate PII from All Cognito Users" } },

      // Main AND gate - both paths needed
      {
        id: "2",
        type: "and-gate",
        data: { label: "Gain Cognito Administrative Access", gateType: "AND" },
      },
      { id: "3", type: "and-gate", data: { label: "Execute Bulk Data Export", gateType: "AND" } },

      // Under Gain Admin Access - OR gates
      {
        id: "4",
        type: "or-gate",
        data: { label: "Compromise User Account with Elevated Permissions", gateType: "OR" },
      },
      { id: "5", type: "or-gate", data: { label: "Privilege Escalation", gateType: "OR" } },
      { id: "6", type: "or-gate", data: { label: "Insider Threat", gateType: "OR" } },

      // Compromise Account attacks
      {
        id: "7",
        type: "leaf-attack",
        data: {
          label: "Phishing Attack on Admin Users",
          description:
            "Targeted phishing campaign to compromise administrator credentials through social engineering techniques.",
          attackChainPhase: "Initial Access",
          impactSeverity: "high",
          likelihood: "high",
          feasibility: 8,
          skillLevel: "intermediate",
          prerequisites: [
            "Identify admin user email addresses",
            "Create convincing phishing content",
            "Setup phishing infrastructure",
          ],
          techniques: [
            "Spear phishing emails with malicious links",
            "Clone legitimate AWS/Cognito login pages",
            "Use urgency tactics to bypass scrutiny",
          ],
          mitreAttack: "T1566.002 - Phishing: Spearphishing Link",
        },
      },
      {
        id: "8",
        type: "leaf-attack",
        data: {
          label: "Credential Stuffing/Password Spraying",
          description:
            "Automated attacks using leaked credentials or common passwords against Cognito authentication endpoints.",
          attackChainPhase: "Credential Access",
          impactSeverity: "high",
          likelihood: "medium",
          feasibility: 7,
          skillLevel: "intermediate",
          prerequisites: [
            "Obtain leaked credential databases",
            "Identify Cognito user pool endpoints",
            "Setup automated attack tools",
          ],
          techniques: [
            "Use credential stuffing tools (e.g., Sentry MBA)",
            "Implement rate limiting evasion",
            "Rotate IP addresses to avoid detection",
          ],
          mitreAttack: "T1110.004 - Brute Force: Credential Stuffing",
        },
      },
      {
        id: "9",
        type: "leaf-attack",
        data: {
          label: "Session Hijacking",
          description:
            "Intercept and steal active session tokens to impersonate authenticated administrators.",
          attackChainPhase: "Credential Access",
          impactSeverity: "critical",
          likelihood: "low",
          feasibility: 6,
          skillLevel: "expert",
          prerequisites: [
            "Position on network path (MITM)",
            "Identify session token format",
            "Bypass token encryption/signing",
          ],
          techniques: [
            "Network sniffing for unencrypted tokens",
            "XSS attacks to steal tokens from browser",
            "Session fixation attacks",
          ],
          mitreAttack: "T1539 - Steal Web Session Cookie",
        },
      },

      // Privilege Escalation attacks
      {
        id: "10",
        type: "leaf-attack",
        data: {
          label: "Exploit IAM Misconfigurations",
          description:
            "Leverage misconfigured IAM policies to escalate privileges from low-privilege user to administrator.",
          attackChainPhase: "Privilege Escalation",
          impactSeverity: "critical",
          likelihood: "medium",
          feasibility: 7,
          skillLevel: "expert",
          prerequisites: [
            "Initial access with low-privilege credentials",
            "Ability to enumerate IAM policies",
            "Knowledge of AWS IAM privilege escalation paths",
          ],
          techniques: [
            "Exploit iam:PassRole with lambda:CreateFunction",
            "Abuse iam:AttachUserPolicy permissions",
            "Leverage iam:UpdateAssumeRolePolicy",
          ],
          mitreAttack: "T1078.004 - Valid Accounts: Cloud Accounts",
        },
      },
      {
        id: "11",
        type: "leaf-attack",
        data: {
          label: "Abuse Overly Permissive Roles",
          description:
            "Exploit roles with excessive permissions that grant unintended access to Cognito administrative functions.",
          attackChainPhase: "Privilege Escalation",
          impactSeverity: "high",
          likelihood: "high",
          feasibility: 8,
          skillLevel: "intermediate",
          prerequisites: [
            "Access to AWS account with any valid credentials",
            "Identify roles with cognito:* or cognito:ListUsers permissions",
            "Ability to assume the target role",
          ],
          techniques: [
            "Enumerate IAM roles and policies",
            "Assume role with excessive permissions",
            "Execute Cognito API calls",
          ],
          mitreAttack: "T1098 - Account Manipulation",
        },
      },

      // Insider Threat attacks
      {
        id: "12",
        type: "leaf-attack",
        data: {
          label: "Malicious Insider with Legitimate Access",
          description:
            "Employee or contractor with legitimate AWS access intentionally exfiltrates user data for malicious purposes.",
          attackChainPhase: "Initial Access",
          impactSeverity: "critical",
          likelihood: "low",
          feasibility: 5,
          skillLevel: "novice",
          prerequisites: [
            "Employment or contractor relationship with organization",
            "Legitimate AWS credentials with Cognito access",
            "Knowledge of data location and value",
          ],
          techniques: [
            "Use legitimate credentials to access Cognito",
            "Execute data export during normal business hours",
            "Blend malicious activity with legitimate work",
          ],
          mitreAttack: "T1078.004 - Valid Accounts: Cloud Accounts",
        },
      },
      {
        id: "13",
        type: "leaf-attack",
        data: {
          label: "Negligent Insider (Credential Exposure)",
          description:
            "Unintentional exposure of AWS credentials through poor security practices, enabling external attackers.",
          attackChainPhase: "Initial Access",
          impactSeverity: "medium",
          likelihood: "medium",
          feasibility: 6,
          skillLevel: "novice",
          prerequisites: [
            "Employee with AWS access",
            "Lack of security awareness training",
            "Weak credential management practices",
          ],
          techniques: [
            "Credentials committed to public GitHub repositories",
            "Credentials shared via insecure channels (email, Slack)",
            "Credentials stored in plaintext on compromised devices",
          ],
          mitreAttack: "T1552.001 - Unsecured Credentials: Credentials In Files",
        },
      },

      // Under Execute Bulk Export
      {
        id: "14",
        type: "leaf-attack",
        data: {
          label: "Access Cognito ListUsers API",
          description:
            "Execute AWS Cognito ListUsers API call to retrieve user pool data including PII attributes.",
          attackChainPhase: "Collection",
          impactSeverity: "high",
          likelihood: "high",
          feasibility: 9,
          skillLevel: "intermediate",
          prerequisites: [
            "Valid AWS credentials with cognito-idp:ListUsers permission",
            "Knowledge of target Cognito User Pool ID",
            "AWS CLI or SDK access",
          ],
          techniques: [
            "Execute aws cognito-idp list-users command",
            "Use boto3 SDK to programmatically call API",
            "Implement pagination to retrieve all users",
          ],
          mitreAttack: "T1530 - Data from Cloud Storage Object",
        },
      },
      { id: "15", type: "and-gate", data: { label: "Bypass Detection/Controls", gateType: "AND" } },
      {
        id: "16",
        type: "and-gate",
        data: { label: "Extract Complete User Dataset", gateType: "AND" },
      },

      // Bypass Detection sub-attacks
      { id: "17", type: "or-gate", data: { label: "Rate Limiting Evasion", gateType: "OR" } },
      { id: "18", type: "or-gate", data: { label: "Logging/Monitoring Evasion", gateType: "OR" } },

      {
        id: "19",
        type: "leaf-attack",
        data: {
          label: "Slow Drip Exfiltration",
          description:
            "Gradually extract user data over extended period to stay below rate limiting thresholds and avoid detection.",
          attackChainPhase: "Exfiltration",
          impactSeverity: "medium",
          likelihood: "high",
          feasibility: 8,
          skillLevel: "intermediate",
          prerequisites: [
            "Understanding of API rate limits",
            "Patience for extended operation",
            "Automated script for scheduled execution",
          ],
          techniques: [
            "Implement delays between API calls",
            "Randomize request timing patterns",
            "Spread requests across multiple days/weeks",
            "Use cron jobs or scheduled tasks",
          ],
          mitreAttack: "T1030 - Data Transfer Size Limits",
        },
      },
      {
        id: "20",
        type: "leaf-attack",
        data: {
          label: "Delete CloudTrail Logs",
          description:
            "Remove CloudTrail audit logs to eliminate evidence of malicious API calls and data exfiltration.",
          attackChainPhase: "Defense Evasion",
          impactSeverity: "high",
          likelihood: "low",
          feasibility: 6,
          skillLevel: "expert",
          prerequisites: [
            "Elevated AWS permissions (cloudtrail:DeleteTrail or s3:DeleteObject)",
            "Knowledge of CloudTrail configuration",
            "Access to S3 bucket storing logs",
          ],
          techniques: [
            "Delete CloudTrail trail configuration",
            "Remove log files from S3 bucket",
            "Disable CloudTrail logging temporarily",
            "Modify S3 bucket lifecycle policies",
          ],
          mitreAttack: "T1070.004 - Indicator Removal: File Deletion",
        },
      },
      {
        id: "21",
        type: "leaf-attack",
        data: {
          label: "Disable Monitoring Alerts",
          description:
            "Deactivate CloudWatch alarms and SNS notifications to prevent security team from detecting suspicious activity.",
          attackChainPhase: "Defense Evasion",
          impactSeverity: "high",
          likelihood: "medium",
          feasibility: 7,
          skillLevel: "expert",
          prerequisites: [
            "CloudWatch and SNS permissions",
            "Knowledge of existing alarm configurations",
            "Understanding of monitoring infrastructure",
          ],
          techniques: [
            "Disable CloudWatch alarms",
            "Delete SNS topic subscriptions",
            "Modify alarm thresholds to unrealistic values",
            "Suppress notifications temporarily",
          ],
          mitreAttack: "T1562.001 - Impair Defenses: Disable or Modify Tools",
        },
      },

      // Extract Dataset sub-attacks
      {
        id: "22",
        type: "leaf-attack",
        data: {
          label: "Implement Pagination Loop",
          description:
            "Create automated script to iterate through all pages of Cognito user results to retrieve complete dataset.",
          attackChainPhase: "Collection",
          impactSeverity: "medium",
          likelihood: "high",
          feasibility: 9,
          skillLevel: "intermediate",
          prerequisites: [
            "Basic programming knowledge (Python, JavaScript)",
            "Understanding of API pagination concepts",
            "AWS SDK or CLI access",
          ],
          techniques: [
            "Use PaginationToken from API responses",
            "Implement while loop until no more pages",
            "Store results incrementally to handle large datasets",
            "Handle API errors and retry logic",
          ],
          mitreAttack: "T1119 - Automated Collection",
        },
      },
      {
        id: "23",
        type: "leaf-attack",
        data: {
          label: "Collect PII Attributes",
          description:
            "Extract sensitive personally identifiable information from Cognito user attributes including email, phone, name, address.",
          attackChainPhase: "Collection",
          impactSeverity: "critical",
          likelihood: "high",
          feasibility: 9,
          skillLevel: "intermediate",
          prerequisites: [
            "Access to ListUsers API response data",
            "Understanding of Cognito user attribute schema",
            "Data parsing capabilities",
          ],
          techniques: [
            "Parse user attributes from API JSON response",
            "Extract standard attributes (email, phone_number, name)",
            "Collect custom attributes if configured",
            "Aggregate data into structured format (CSV, JSON)",
          ],
          mitreAttack: "T1005 - Data from Local System",
        },
      },
      { id: "24", type: "or-gate", data: { label: "Exfiltrate Data", gateType: "OR" } },

      {
        id: "25",
        type: "leaf-attack",
        data: {
          label: "Direct Download to Attacker System",
          description:
            "Transfer collected PII data directly to attacker-controlled infrastructure over internet connection.",
          attackChainPhase: "Exfiltration",
          impactSeverity: "critical",
          likelihood: "high",
          feasibility: 8,
          skillLevel: "intermediate",
          prerequisites: [
            "Collected user data in memory or local storage",
            "Attacker-controlled server or endpoint",
            "Network connectivity from compromised environment",
          ],
          techniques: [
            "HTTP POST to attacker web server",
            "FTP/SFTP upload to remote server",
            "Email data as attachment",
            "Use encrypted channels (HTTPS, SSH) to avoid detection",
          ],
          mitreAttack: "T1041 - Exfiltration Over C2 Channel",
        },
      },
      {
        id: "26",
        type: "leaf-attack",
        data: {
          label: "Transfer to External Storage (S3)",
          description:
            "Upload stolen PII data to attacker-controlled or misconfigured S3 bucket for later retrieval.",
          attackChainPhase: "Exfiltration",
          impactSeverity: "critical",
          likelihood: "medium",
          feasibility: 7,
          skillLevel: "expert",
          prerequisites: [
            "Access to S3 bucket (attacker-owned or compromised)",
            "S3 write permissions",
            "AWS CLI or SDK configured",
          ],
          techniques: [
            "Use aws s3 cp command to upload data",
            "Create temporary S3 bucket in compromised account",
            "Upload to public S3 bucket with write access",
            "Use S3 presigned URLs for anonymous upload",
          ],
          mitreAttack: "T1567.002 - Exfiltration to Cloud Storage",
        },
      },
    ],
    edges: [
      // Root to main branches
      {
        id: "e1-2",
        source: "1",
        target: "2",
        type: "smoothstep",
        style: { stroke: "#555", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e1-3",
        source: "1",
        target: "3",
        type: "smoothstep",
        style: { stroke: "#555", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },

      // Gain Admin Access branches (AND gate to OR gates)
      {
        id: "e2-4",
        source: "2",
        target: "4",
        type: "smoothstep",
        style: { stroke: "#7eb3d5", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e2-5",
        source: "2",
        target: "5",
        type: "smoothstep",
        style: { stroke: "#7eb3d5", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e2-6",
        source: "2",
        target: "6",
        type: "smoothstep",
        style: { stroke: "#7eb3d5", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },

      // Compromise Account attacks (OR gate)
      {
        id: "e4-7",
        source: "4",
        target: "7",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e4-8",
        source: "4",
        target: "8",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e4-9",
        source: "4",
        target: "9",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },

      // Privilege Escalation attacks (OR gate)
      {
        id: "e5-10",
        source: "5",
        target: "10",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e5-11",
        source: "5",
        target: "11",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },

      // Insider Threat attacks (OR gate)
      {
        id: "e6-12",
        source: "6",
        target: "12",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e6-13",
        source: "6",
        target: "13",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },

      // Execute Bulk Export branches (AND gate)
      {
        id: "e3-14",
        source: "3",
        target: "14",
        type: "smoothstep",
        style: { stroke: "#7eb3d5", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e3-15",
        source: "3",
        target: "15",
        type: "smoothstep",
        style: { stroke: "#7eb3d5", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e3-16",
        source: "3",
        target: "16",
        type: "smoothstep",
        style: { stroke: "#7eb3d5", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },

      // Bypass Detection branches (AND gate to OR gates)
      {
        id: "e15-17",
        source: "15",
        target: "17",
        type: "smoothstep",
        style: { stroke: "#7eb3d5", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e15-18",
        source: "15",
        target: "18",
        type: "smoothstep",
        style: { stroke: "#7eb3d5", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },

      {
        id: "e17-19",
        source: "17",
        target: "19",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e18-20",
        source: "18",
        target: "20",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e18-21",
        source: "18",
        target: "21",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },

      // Extract Dataset branches (AND gate)
      {
        id: "e16-22",
        source: "16",
        target: "22",
        type: "smoothstep",
        style: { stroke: "#7eb3d5", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e16-23",
        source: "16",
        target: "23",
        type: "smoothstep",
        style: { stroke: "#7eb3d5", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e16-24",
        source: "16",
        target: "24",
        type: "smoothstep",
        style: { stroke: "#7eb3d5", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },

      // Exfiltrate Data (OR gate)
      {
        id: "e24-25",
        source: "24",
        target: "25",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e24-26",
        source: "24",
        target: "26",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
    ],
  };
};

const getDefaultAttackTree = () => {
  return {
    nodes: [
      // Root Goal Node
      {
        id: "1",
        type: "root",
        data: {
          label: "Steal Customer Payment Data",
        },
      },
      // OR Gate - Multiple paths to achieve goal
      {
        id: "2",
        type: "or-gate",
        data: {
          label: "Data Breach Vectors",
          gateType: "OR",
        },
      },
      // AND Gate - Web Application Compromise
      {
        id: "3",
        type: "and-gate",
        data: {
          label: "Compromise Web Application",
          gateType: "AND",
        },
      },
      // Leaf Attack - SQL Injection
      {
        id: "4",
        type: "leaf-attack",
        data: {
          label: "SQL Injection on Checkout",
          attackChainPhase: "Initial Access",
          mitreAttack: "T1190",
          feasibility: 7,
          skillLevel: "intermediate",
          impactSeverity: "critical",
        },
      },
      // Leaf Attack - Session Management
      {
        id: "5",
        type: "leaf-attack",
        data: {
          label: "Exploit Session Management",
          attackChainPhase: "Credential Access",
          mitreAttack: "T1539",
          feasibility: 6,
          skillLevel: "expert",
          impactSeverity: "high",
        },
      },
      // AND Gate - Network Interception
      {
        id: "6",
        type: "and-gate",
        data: {
          label: "Network Interception",
          gateType: "AND",
        },
      },
      // Leaf Attack - MITM
      {
        id: "7",
        type: "leaf-attack",
        data: {
          label: "Man-in-the-Middle Attack",
          attackChainPhase: "Collection",
          mitreAttack: "T1557",
          feasibility: 5,
          skillLevel: "expert",
          impactSeverity: "critical",
        },
      },
      // Leaf Attack - WiFi Compromise
      {
        id: "8",
        type: "leaf-attack",
        data: {
          label: "Compromise WiFi Network",
          attackChainPhase: "Initial Access",
          mitreAttack: "T1200",
          feasibility: 6,
          skillLevel: "intermediate",
          impactSeverity: "high",
        },
      },
      // OR Gate - Insider Threat
      {
        id: "9",
        type: "or-gate",
        data: {
          label: "Insider Threat",
          gateType: "OR",
        },
      },
      // Leaf Attack - Bribery
      {
        id: "10",
        type: "leaf-attack",
        data: {
          label: "Bribe Employee",
          attackChainPhase: "Reconnaissance",
          mitreAttack: "T1589",
          feasibility: 4,
          skillLevel: "novice",
          impactSeverity: "critical",
        },
      },
      // Leaf Attack - Social Engineering
      {
        id: "11",
        type: "leaf-attack",
        data: {
          label: "Social Engineering Staff",
          attackChainPhase: "Reconnaissance",
          mitreAttack: "T1598",
          feasibility: 7,
          skillLevel: "intermediate",
          impactSeverity: "high",
        },
      },
    ],
    edges: [
      // Root to main OR gate
      {
        id: "e1-2",
        source: "1",
        target: "2",
        type: "smoothstep",
        style: { stroke: "#555", strokeWidth: 2.5 },
      },
      // OR gate to attack paths (soft pink for OR - matches icon background)
      {
        id: "e2-3",
        source: "2",
        target: "3",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e2-6",
        source: "2",
        target: "6",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e2-9",
        source: "2",
        target: "9",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      // Web Application AND gate to attacks (soft blue for AND - matches icon background)
      {
        id: "e3-4",
        source: "3",
        target: "4",
        type: "smoothstep",
        style: { stroke: "#7eb3d5", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e3-5",
        source: "3",
        target: "5",
        type: "smoothstep",
        style: { stroke: "#7eb3d5", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      // Network Interception AND gate to attacks (soft blue for AND - matches icon background)
      {
        id: "e6-7",
        source: "6",
        target: "7",
        type: "smoothstep",
        style: { stroke: "#7eb3d5", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e6-8",
        source: "6",
        target: "8",
        type: "smoothstep",
        style: { stroke: "#7eb3d5", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      // Insider Threat OR gate to attacks (soft pink for OR - matches icon background)
      {
        id: "e9-10",
        source: "9",
        target: "10",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
      {
        id: "e9-11",
        source: "9",
        target: "11",
        type: "smoothstep",
        style: { stroke: "#c97a9e", strokeWidth: 2, strokeDasharray: "5, 5" },
        animated: true,
      },
    ],
  };
};
