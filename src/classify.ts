import type { ChangedFile, FileRisk, FileRiskReport, RiskCategory } from "./types.ts";

type Rule = {
  category: RiskCategory;
  test: (path: string, content: string) => string | null;
};

const RULES: Rule[] = [
  {
    category: "authentication",
    test: (path, content) => {
      if (
        /(^|\/)(auth|oauth|sso|session|passport|jwt|login|signin|signup|permission|rbac|iam)(\/|$|\.|-)/i.test(path) ||
        /next-auth|clerk|firebase-auth|openid|saml/i.test(path)
      ) {
        return "Path looks authentication-related";
      }
      if (/\b(bcrypt|argon2|password_hash|jsonwebtoken|passport\.authenticate|checkPermission)\b/i.test(content)) {
        return "Content touches authentication or authorization APIs";
      }
      return null;
    },
  },
  {
    category: "payments",
    test: (path, content) => {
      if (/stripe|paypal|braintree|billing|payment|checkout|invoice|pci/i.test(path)) {
        return "Path looks payment-related";
      }
      if (/\b(stripe|paymentintent|charges\.create|paypal)\b/i.test(content)) {
        return "Content references payment providers or charges";
      }
      return null;
    },
  },
  {
    category: "database_migrations",
    test: (path, content) => {
      if (/migrat|alembic|flyway|liquibase|prisma\/migrations|knex\/migrations|drizzle/i.test(path)) {
        return "Path looks like a database migration";
      }
      if (/\b(CREATE|ALTER|DROP)\s+TABLE\b/i.test(content) || /\bADD\s+COLUMN\b/i.test(content)) {
        return "Content contains schema-changing SQL";
      }
      return null;
    },
  },
  {
    category: "dependencies",
    test: (path) => {
      if (
        /(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|go\.(mod|sum)|Gemfile(\.lock)?|requirements.*\.txt|Pipfile(\.lock)?|Cargo\.(toml|lock)|composer\.(json|lock)|pom\.xml|build\.gradle(\.kts)?)$/i.test(
          path,
        )
      ) {
        return "Dependency manifest or lockfile changed";
      }
      return null;
    },
  },
  {
    category: "configuration",
    test: (path) => {
      if (/(^|\/)\.env($|\.)/i.test(path) || /\.(ini|tfvars|config\.(js|ts|json|ya?ml))$/i.test(path)) {
        return "Configuration or environment file changed";
      }
      if (/(^|\/)(config|settings|secrets)(\/|$)/i.test(path) && !/\.md$/i.test(path)) {
        return "Config directory file changed";
      }
      return null;
    },
  },
  {
    category: "apis",
    test: (path) => {
      if (/(^|\/)(routes?|controllers?|handlers?|graphql|openapi|swagger|proto)(\/|$|\.)/i.test(path)) {
        return "API route, schema, or controller changed";
      }
      if (/\.(proto)$/i.test(path) || /openapi|swagger/i.test(path)) {
        return "API contract file changed";
      }
      return null;
    },
  },
  {
    category: "deployment",
    test: (path) => {
      if (
        /(^|\/)(Dockerfile|docker-compose\.ya?ml|Procfile|vercel\.json|netlify\.toml|fly\.toml|cloudbuild\.ya?ml|skaffold\.ya?ml|Chart\.ya?ml)$/i.test(
          path,
        ) ||
        /(^|\/)(\.github\/workflows|helm|k8s|kubernetes|deploy|terraform|cloudformation)(\/|$)/i.test(path)
      ) {
        return "Deployment, CI workflow, or infrastructure file changed";
      }
      return null;
    },
  },
];

const DESTRUCTIVE =
  /\bDROP\s+(TABLE|COLUMN|DATABASE|SCHEMA)\b|\bTRUNCATE\s+TABLE\b|\bALTER\s+TABLE\b[\s\S]{0,80}\bDROP\b/i;

const CONTENT_DRIVEN: RiskCategory[] = ["authentication", "payments", "database_migrations"];

/** Test fixtures and rule-definition sources often mention risky keywords without shipping them. */
function isFixtureOrRuleSource(path: string): boolean {
  return (
    /(^|\/)tests?\//i.test(path) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/i.test(path) ||
    /(^|\/)(classify|secrets)\.[cm]?[jt]sx?$/i.test(path)
  );
}

const HIGH_RISK: RiskCategory[] = [
  "authentication",
  "payments",
  "database_migrations",
  "configuration",
  "deployment",
];

export function classifyChangedFiles(files: ChangedFile[]): FileRiskReport {
  const classified: FileRisk[] = files.map((file) => {
    const content = [file.patch ?? "", ...file.added_lines].join("\n");
    const categories: RiskCategory[] = [];
    const reasons: string[] = [];
    const skipContent = isFixtureOrRuleSource(file.path);

    for (const rule of RULES) {
      if (skipContent && CONTENT_DRIVEN.includes(rule.category)) {
        // Still honor path-based signals (e.g. db/migrations/*.sql), but ignore keyword hits in fixtures.
        const pathOnly = rule.test(file.path, "");
        if (pathOnly) {
          categories.push(rule.category);
          reasons.push(pathOnly);
        }
        continue;
      }
      const reason = rule.test(file.path, content);
      if (reason) {
        categories.push(rule.category);
        reasons.push(reason);
      }
    }

    return { path: file.path, categories, reasons };
  });

  const highRiskFiles = classified
    .filter((file) => file.categories.some((category) => HIGH_RISK.includes(category)))
    .map((file) => file.path);

  const categoriesPresent = [...new Set(classified.flatMap((file) => file.categories))];

  const destructive = files.some((file) => {
    if (isFixtureOrRuleSource(file.path)) return false;
    return DESTRUCTIVE.test([file.patch ?? "", ...file.added_lines].join("\n"));
  });

  return {
    files: classified,
    high_risk_files: highRiskFiles,
    categories_present: categoriesPresent,
    destructive_schema_change: destructive,
  };
}

export { HIGH_RISK };
