const getDailyPromptIndex = (promptCount: number): number =>
  Math.floor(Date.now() / 86400000) % promptCount

export { getDailyPromptIndex }
