/**
 * Five Server — rechargement live du frontend uniquement.
 * Sans cette config, chaque upload dans backend/uploads/ provoque un refresh
 * complet de la page (Five Server surveille tout le dossier projet).
 */
module.exports = {
  watch: ["frontend/**", "assets/**", "index.html"],
  ignore: ["backend/**", "**/node_modules/**"],
};
