import { createRequire } from "node:module";

export const uiAreas = {
  customer: {
    sources: ["src/features/customers/customer-home.tsx", "src/features/customers/customer-home.module.css"],
    unit: ["src/features/customers/customer-home.test.ts"],
    browser: ["tests/e2e/customer-ceramic-navigation.spec.ts"],
  },
  inventory: {
    sources: ["src/features/inventory/inventory-workspace.tsx", "src/features/inventory/inventory.module.css"],
    unit: ["src/features/inventory/inventory-workspace-lifecycle.test.ts"],
    browser: ["tests/e2e/inventory-settings-navigation.spec.ts"],
  },
  shell: {
    sources: ["src/features/app-shell/app-shell-header.tsx", "src/features/app-shell/welcome-greeting.tsx", "src/features/app-shell/welcome-greeting.module.css"],
    unit: ["src/features/app-shell/app-shell-header.test.ts", "src/features/app-shell/welcome-greeting.test.ts"],
    browser: ["tests/e2e/header-layout.spec.ts", "tests/e2e/welcome-greeting.spec.ts"],
  },
  sales: {
    sources: ["src/features/sales-cycle/sales-school-cards.tsx", "src/features/sales-cycle/sales-district-filter.tsx"],
    unit: ["src/features/sales-cycle/sales-school-card-presentation.test.ts", "src/features/sales-cycle/sales-district-filter-model.test.ts"],
    browser: ["tests/e2e/sales-school-cards.spec.ts", "tests/e2e/sales-district-filter.spec.ts"],
  },
};

// Parse syntax rather than stripping matching text from strings/comments.
// Only intrinsic JSX presentation may differ; handlers, expressions and custom
// component props remain in the canonical tree and must match exactly.
export function presentationOnly(before, after) {
  if (typeof before !== "string" || typeof after !== "string") return false;
  try {
    const ts = createRequire(import.meta.url)(process.env.CI_TYPESCRIPT_PATH || "typescript");
    const literal = n => ts.isStringLiteral(n) || ts.isNumericLiteral(n) ||
      (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand));
    const staticValue = n => literal(n) || (ts.isObjectLiteralExpression(n) && n.properties.every(p =>
      ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && literal(p.initializer)));
    const canonical = source => {
      const file = ts.createSourceFile("ui.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      if (file.parseDiagnostics.length) throw new Error("Invalid TSX");
      const transformed = ts.transform(file, [context => {
        const visit = node => {
          if (ts.isJsxText(node) && ts.isJsxElement(node.parent) &&
              ts.isIdentifier(node.parent.openingElement.tagName) && /^[a-z]/.test(node.parent.openingElement.tagName.text)) {
            return ts.factory.createJsxText("");
          }
          if (ts.isJsxAttribute(node)) {
            const tag = node.parent.parent.tagName;
            const value = node.initializer;
            if (ts.isIdentifier(tag) && /^[a-z]/.test(tag.text) &&
                ["className", "style", "width", "height"].includes(node.name.text) && value &&
                (ts.isStringLiteral(value) || (ts.isJsxExpression(value) && value.expression &&
                  (staticValue(value.expression) || (node.name.text === "className" &&
                    ts.isPropertyAccessExpression(value.expression) && ts.isIdentifier(value.expression.expression) &&
                    value.expression.expression.text === "styles"))))) return undefined;
          }
          return ts.visitEachChild(node, visit, context);
        };
        return root => ts.visitNode(root, visit);
      }]);
      try { return ts.createPrinter({ removeComments: false }).printFile(transformed.transformed[0]); }
      finally { transformed.dispose(); }
    };
    return canonical(before) === canonical(after);
  } catch { return false; }
}
