// Full-text search authority: extractors, query parser, indexer and access-filtered SearchService.
export { SEARCH_EXTRACTORS, extractBodyText } from "./extractors.ts";
export type { SearchExtractor } from "./extractors.ts";
export { parseSearchQuery } from "./query-parser.ts";
export type { ParsedSearchQuery } from "./query-parser.ts";
export { createSearchService } from "./service.ts";
export type {
  SearchOutcome,
  SearchRefusal,
  SearchRequest,
  SearchService,
  SearchServiceOptions,
} from "./service.ts";
