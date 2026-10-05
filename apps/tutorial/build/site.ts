/**
 * The tutorial's content and reference, built together so they can link to
 * each other: the reference first (its entries are the link targets), then
 * the lessons with their code spans linked, then "Learn it in" and the index
 * links from the lessons' keywords.
 */
import path from "node:path";
import type { TutorialContent } from "../src/content-types.js";
import type { ReferenceContent } from "../src/reference-types.js";
import { loadContent } from "./content.js";
import { loadReference } from "./reference.js";
import { linkReference, referenceTargets } from "./reference-links.js";

export interface Site {
  content: TutorialContent;
  reference: ReferenceContent;
}

export function loadSite(appRoot: string): Site {
  const repoRoot = path.resolve(appRoot, "..", "..");
  const reference = loadReference(repoRoot);
  const targets = referenceTargets(reference);
  const content = loadContent(path.join(appRoot, "content"), { codeLink: (code) => targets.resolve(code) });
  linkReference(reference, content, targets);
  return { content, reference };
}
