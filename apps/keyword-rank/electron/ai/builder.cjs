module.exports={
  appId:'com.keywordrank.ai',productName:'关键词排名每日跟进 AI 增强版',
  extraMetadata:{main:'electron/ai/main.cjs'},
  directories:{output:'release-ai'},
  files:['ai-ui/**/*','electron/ai/**/*','src/ai/core.mjs','package.json','!electron/ai/builder.cjs'],
  extraResources:[],asar:true,
  win:{icon:'build/icon.ico',target:[{target:'portable',arch:['x64']}],artifactName:'keyword-rank-ai-v2.1.${ext}'},
};
