declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}

declare module '*.css' {
  const stylesheet: string
  export default stylesheet
}
