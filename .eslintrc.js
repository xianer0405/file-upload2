module.exports = {
  root: true,
  env: {
    node: true
  },
  'extends': [
    'plugin:vue/essential',
    '@vue/standard'
  ],
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    "babel/no-unused-expressions": 1 // doesn't fail when using do expressions or optional chaining (a?.b()).
  },
  parserOptions: {
    parser: 'babel-eslint'
  }
}
