// 🛡️ ACTIVATE RESOURCE GUARDIAN ON SERVER STARTUP
const ResourceGuardian = require('./resourceGuardian');

// Global instance
let resourceGuardian;

const activateResourceProtection = () => {
  console.log('🚀 ACTIVATING RESOURCE PROTECTION SYSTEM...');
  resourceGuardian = new ResourceGuardian();
  return resourceGuardian;
};

// Auto-activate when imported
activateResourceProtection();

module.exports = { resourceGuardian, activateResourceProtection };