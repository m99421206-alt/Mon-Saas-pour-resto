/**
 * Content Security Policy — API Express (Helmet).
 * Le frontend statique doit aussi être servi avec une CSP (Nginx / meta) pour une protection complète.
 */

"use strict";

function buildHelmetCspDirectives(isProduction, allowedOrigins) {
  var connectSrc = ["'self'"];
  allowedOrigins.forEach(function (origin) {
    if (origin && origin !== "*" && connectSrc.indexOf(origin) === -1) {
      connectSrc.push(origin);
    }
  });

  if (!isProduction) {
    connectSrc.push("http://127.0.0.1:*", "http://localhost:*", "http://192.168.*:*", "http://10.*:*");
  }

  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],
    objectSrc: ["'none'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    imgSrc: ["'self'", "data:", "blob:", "https:"],
    connectSrc: connectSrc,
    upgradeInsecureRequests: isProduction ? [] : null,
  };
}

module.exports = {
  buildHelmetCspDirectives: buildHelmetCspDirectives,
};
