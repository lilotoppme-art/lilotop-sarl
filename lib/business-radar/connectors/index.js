const connectors = { demo: require("./demo"), rss: require("./rss"), html: require("./html") };

async function collectFromSource(source) {
  if (source.type === "manual") return [];
  const connector = connectors[source.type];
  if (!connector) throw Object.assign(new Error(`Unsupported connector: ${source.type}`), { code: "VALIDATION_ERROR" });
  return connector.collect(source);
}

module.exports = { collectFromSource };
