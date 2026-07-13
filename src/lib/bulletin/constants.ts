export const BULLETIN_ORIGIN = "https://bulletins.nyu.edu";
export const BULLETIN_SHANGHAI_PATH = "/undergraduate/shanghai/";

export const PROGRAM_INDEX_URL = `${BULLETIN_ORIGIN}${BULLETIN_SHANGHAI_PATH}programs/`;
export const COURSE_INDEX_URL = `${BULLETIN_ORIGIN}${BULLETIN_SHANGHAI_PATH}courses/`;
export const SITEMAP_URL = `${BULLETIN_ORIGIN}/sitemap.xml`;

export const BULLETIN_DISCOVERY_URLS = [
  PROGRAM_INDEX_URL,
  COURSE_INDEX_URL,
  SITEMAP_URL,
] as const;
