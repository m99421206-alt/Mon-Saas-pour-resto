/**
 * Validation réglages plateforme (admin).
 */

"use strict";

var { z } = require("zod");
var { parseBody } = require("./helpers");
var { boolTinyintInput } = require("./common");

var subscriptionPlanSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.union([z.string(), z.number()]).optional(),
  price_cfa: z.coerce.number().finite().min(0).max(999999999).optional(),
  months: z.coerce.number().int().min(1).max(240).optional(),
});

var platformSettingsBodySchema = z
  .object({
    maintenance_mode: boolTinyintInput.optional(),
    upload_max_mb: z.coerce.number().finite().min(1).max(64).optional(),
    trial_period_days: z.coerce.number().int().min(1).max(365).optional(),
    subscription_plans: z.array(subscriptionPlanSchema).max(12).optional(),
  })
  .transform(function (data) {
    var patch = {};
    if (data.maintenance_mode !== undefined) {
      patch.maintenance_mode = data.maintenance_mode === 1;
    }
    if (data.upload_max_mb !== undefined) {
      patch.upload_max_mb = Math.round(data.upload_max_mb);
    }
    if (data.trial_period_days !== undefined) {
      patch.trial_period_days = Math.round(data.trial_period_days);
    }
    if (data.subscription_plans !== undefined) {
      patch.subscription_plans = data.subscription_plans;
    }
    return patch;
  });

function parsePlatformSettingsBody(body) {
  return parseBody(platformSettingsBodySchema, body);
}

module.exports = {
  parsePlatformSettingsBody: parsePlatformSettingsBody,
};
