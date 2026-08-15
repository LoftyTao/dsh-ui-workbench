declare module '*.css' {
  const installStyle: () => () => void
  export default installStyle
}
