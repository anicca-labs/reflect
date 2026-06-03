const MS_PER_DAY = 86_400_000

const getDailyPromptIndex = (promptCount: number): number =>
  Math.floor(Date.now() / MS_PER_DAY) % promptCount

export { getDailyPromptIndex }
