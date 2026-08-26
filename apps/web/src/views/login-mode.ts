export function isDevLoginEnabled(apiMode: string | undefined, flag: string | undefined) {
  return apiMode === 'http' && flag === 'true'
}
