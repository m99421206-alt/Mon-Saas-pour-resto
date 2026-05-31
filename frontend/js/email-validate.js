(function () {
  "use strict";

  var TYPO_TLDS = {
    con: true,
    comm: true,
    cmo: true,
    coom: true,
    comn: true,
  };

  function isValidEmail(email) {
    var s = String(email || "").trim().toLowerCase();
    if (!s || /\s/.test(s)) {
      return false;
    }
    if ((s.match(/@/g) || []).length !== 1) {
      return false;
    }

    var parts = s.split("@");
    var local = parts[0];
    var domain = parts[1];

    if (!local || local.length > 64 || !/^[a-z0-9._%+-]+$/.test(local)) {
      return false;
    }
    if (!domain || domain.length > 253 || domain.indexOf(".") === -1) {
      return false;
    }

    var labels = domain.split(".");
    if (labels.length < 2) {
      return false;
    }

    var tld = labels[labels.length - 1];
    if (!/^[a-z]{2,63}$/.test(tld) || TYPO_TLDS[tld]) {
      return false;
    }

    for (var i = 0; i < labels.length; i += 1) {
      var label = labels[i];
      if (!label || label.length > 63) {
        return false;
      }
      if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) {
        return false;
      }
    }

    return true;
  }

  function emailFormatMessage() {
    return "Adresse email incorrecte. Vérifiez le format (ex. : nom@gmail.com).";
  }

  window.MenuGo_EmailValidate = {
    isValidEmail: isValidEmail,
    emailFormatMessage: emailFormatMessage,
  };
})();
