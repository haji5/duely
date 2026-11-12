/**
 * The bracket categories the server accepts (Categories.java); anything else is a 400.
 * Both test suites check their list against shared/categories.json.
 */
export const CATEGORIES = [
  'General', 'Music', 'TV', 'Movies', 'Sports', 'Gaming', 'Food', 'Travel', 'Art', 'Technology', 'Entertainment',
] as const;
