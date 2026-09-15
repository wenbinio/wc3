'use strict';
// Opt-in strict adapter: ordinary harness behavior remains unchanged.
const {loadMap}=require('../lib/sim');
const DELIBERATE_STUBS=new Set(['TriggerSleepAction','PolledWait','SetPlayerRaceSelectable','SetMapDescription','SetGamePlacement','IsDestructableInvulnerable','GetCameraMargin','GetCameraTargetPositionX','GetCameraTargetPositionY']);
function strictLoad(target,options={}){
 const allowed=new Set(options.allowStubs||[]);
 for(const name of allowed)if(typeof name!=='string'||!/^[A-Za-z_]\w*$/.test(name))throw new Error('allowStubs requires exact names');
 const sim=loadMap(target,{...options,config:false,main:false});
 for(const name of sim.coverage().stubbed)if(!allowed.has(name))throw new Error('Unmodelled native during top-level load: '+name);
 const unsupported=name=>{sim.stubbed.set(name,(sim.stubbed.get(name)||0)+1);throw new Error('Unmodelled WC3 native: '+name);};
 const oldHook=sim.vm.getGlobal('__SIM_INDEX_FACTORY');
 sim.vm.installIndexHook(name=>{const results=oldHook(name),value=results[0];if(typeof value==='function'&&!allowed.has(name))return ()=>unsupported(name);return value;});
 for(const name of DELIBERATE_STUBS)if(!allowed.has(name))sim.vm.setGlobal(name,()=>unsupported(name));
 // Existing top-level lookups may already have memoized an auto-stub.
 for(const name of sim.coverage().stubbed)if(!allowed.has(name))sim.vm.setGlobal(name,()=>unsupported(name));
 if(options.config!==false&&sim.vm.hasGlobal('config'))sim.call('config');
 if(options.main!==false&&sim.vm.hasGlobal('main'))sim.call('main');
 sim.nativePolicy={strict:true,allowedStubs:[...allowed],runtimeValidated:false};return sim;
}
module.exports={strictLoad,DELIBERATE_STUBS};
