-- After Hours: Emergency Lighting. Original map by Serendipity.
-- Shared gameplay is deterministic. GetLocalPlayer is used ONLY for camera/UI.
-- The engine moves every actor using issued orders; the only teleport is the
-- explicitly designed capture penalty, which returns a worker to reception.

function AH_Distance(x1,y1,x2,y2)
    local dx,dy=x1-x2,y1-y2
    return math.sqrt(dx*dx+dy*dy)
end
function AH_Say(message)
    for i=0,3 do if AH.active[i] then DisplayTimedTextToPlayer(Player(i),0,0,7,message) end end
end
function AH_Cell(x,y)
    return math.floor((x+1920)/256)+1, math.floor((1920-y)/256)+1
end
function AH_Open(c,r)
    return r>=1 and r<=15 and c>=1 and c<=15 and string.sub(AH_LAYOUT[r],c,c)~='#'
end
-- Breadth-first routing over the same cells used to author the actual WPM.
function AH_NextPoint(x,y,tx,ty)
    local sc,sr=AH_Cell(x,y)
    local tc,tr=AH_Cell(tx,ty)
    if not AH_Open(sc,sr) or not AH_Open(tc,tr) then return nil,nil,999 end
    local start=(sr-1)*15+sc
    local goal=(tr-1)*15+tc
    if start==goal then return tx,ty,0 end
    local q={start};local head=1;local parent={[start]=0};local distance={[start]=0}
    while head<=#q do
        local id=q[head];head=head+1
        local c=(id-1)%15+1;local r=math.floor((id-1)/15)+1
        local neighbours={{c+1,r},{c-1,r},{c,r+1},{c,r-1}}
        for _,p in ipairs(neighbours) do
            local nextId=(p[2]-1)*15+p[1]
            if AH_Open(p[1],p[2]) and parent[nextId]==nil then
                parent[nextId]=id;distance[nextId]=distance[id]+1;q[#q+1]=nextId
                if nextId==goal then
                    local step=goal
                    while parent[step]~=start do step=parent[step] end
                    local nc=(step-1)%15+1;local nr=math.floor((step-1)/15)+1
                    return -1792+(nc-1)*256,1792-(nr-1)*256,distance[goal]
                end
            end
        end
    end
    return nil,nil,999
end
function AH_Valid(i)
    return i>=0 and i<=3 and AH.active[i] and not AH.exhausted[i] and AH.workers[i]~=nil
end
function AH_Finish(won,reason)
    if AH.ended then return end
    AH.ended=true;AH.won=won;AH.reason=reason
    AH_Say(reason)
    for i=0,3 do
        if AH.active[i] then
            if won then CustomVictoryBJ(Player(i),true,true) else CustomDefeatBJ(Player(i),reason) end
        end
    end
end
function AH_Status(i)
    if not AH.active[i] then return end
    local objective=AH.powered and 'Power restored. Bring the remaining workers to EXIT.' or 'Find all three fuses; use them at MAINTENANCE.'
    DisplayTimedTextToPlayer(Player(i),0,0,8,'Fuses '..AH.collected..'/3 | Stamina '..math.floor(AH.stamina[i])..' | Captures '..AH.strikes[i]..'/3 | '..math.max(0,600-math.floor(AH.clock))..'s left.\n'..objective)
end
function AH_Sprint(i)
    if not AH_Valid(i) or AH.ended then return false end
    if AH.clock<AH.sprintReady[i] or AH.stamina[i]<50 then
        DisplayTimedTextToPlayer(Player(i),0,0,3,'Sprint needs 50 stamina and its 10-second cooldown.');return false
    end
    AH.stamina[i]=AH.stamina[i]-50;AH.sprintUntil[i]=AH.clock+4;AH.sprintReady[i]=AH.clock+10;AH.quiet[i]=false
    return true
end
function AH_Quiet(i)
    if not AH_Valid(i) or AH.ended then return false end
    AH.quiet[i]=not AH.quiet[i];AH.sprintUntil[i]=0
    DisplayTimedTextToPlayer(Player(i),0,0,3,AH.quiet[i] and 'Quiet walking. Slower; harder to hear.' or 'Walking normally.')
    return true
end
function AH_Interact(i)
    if not AH_Valid(i) or AH.ended then return false end
    local u=AH.workers[i];local x,y=GetUnitX(u),GetUnitY(u)
    for n,p in ipairs(AH_FUSES) do
        if not AH.taken[n] and AH_Distance(x,y,p[1],p[2])<=160 then
            AH.taken[n]=true;AH.collected=AH.collected+1
            RemoveUnit(AH.fuseUnits[n]);AH.fuseUnits[n]=nil
            AH_Say('Fuse '..AH.collected..'/3 recovered. '..(AH.collected==3 and 'Take them to MAINTENANCE.' or 'The hum changes pitch.'))
            return true
        end
    end
    if AH_Distance(x,y,AH_GENERATOR[1],AH_GENERATOR[2])<=170 then
        if AH.powered then DisplayTimedTextToPlayer(Player(i),0,0,4,'The generator is running. Find EXIT.');return false end
        if AH.collected<3 then DisplayTimedTextToPlayer(Player(i),0,0,4,'Three sockets. You have '..AH.collected..' fuses.');return false end
        AH.powered=true;AH_Say('The lights hold. Somewhere, a door unlocks. The footsteps accelerate. Bring everyone to EXIT.')
        SetUnitVertexColor(AH.generator,105,190,132,255)
        return true
    end
    if AH_Distance(x,y,AH_EXIT[1],AH_EXIT[2])<=180 then
        if not AH.powered then DisplayTimedTextToPlayer(Player(i),0,0,4,'The green sign is lit. The lock is not. Restore power.');return false end
        for j=0,3 do
            if AH_Valid(j) and AH_Distance(GetUnitX(AH.workers[j]),GetUnitY(AH.workers[j]),AH_EXIT[1],AH_EXIT[2])>220 then
                DisplayTimedTextToPlayer(Player(i),0,0,4,'Someone is still inside. Get the remaining workers to this door.');return false
            end
        end
        AH_Finish(true,'You step into air that does not smell of warm carpet. The shift is over.');return true
    end
    DisplayTimedTextToPlayer(Player(i),0,0,3,'Move closer to a fuse, MAINTENANCE, or EXIT.');return false
end
function AH_Help(i)
    DisplayTimedTextToPlayer(Player(i),0,0,14,'AFTER HOURS — Right-click: move | E: interact | Q: quiet walk | R: sprint.\nCollect 3 fuses, use MAINTENANCE, reach EXIT together. Reception is safe. Three captures exhaust a worker. Gold=fuses; lumber=stamina.\nChat fallbacks: -use, -quiet, -sprint, -status, -help, -credits.')
end
function AH_Chat()
    local i=GetPlayerId(GetTriggerPlayer());local message=string.lower(GetEventPlayerChatString())
    if message=='-use' then AH_Interact(i)
    elseif message=='-sprint' then AH_Sprint(i)
    elseif message=='-quiet' then AH_Quiet(i)
    elseif message=='-status' then AH_Status(i)
    elseif message=='-help' then AH_Help(i)
    elseif message=='-credits' then DisplayTimedTextToPlayer(Player(i),0,0,8,'Map: Serendipity. Original generated scenery, icons and sound. Built with wc3-map-toolkit; model helper based on its Northreach generator. Stock worker art is referenced from your game, not redistributed.') end
end
function AH_Cast()
    local u=GetTriggerUnit();local i=GetPlayerId(GetOwningPlayer(u))
    if not AH_Valid(i) or u~=AH.workers[i] then return end
    local spell=GetSpellAbilityId()
    if spell==ABIL_INTERACT then AH_Interact(i)
    elseif spell==ABIL_SPRINT then AH_Sprint(i)
    elseif spell==ABIL_QUIET_WALK then AH_Quiet(i) end
end
function AH_Label(text,x,y)
    local t=CreateTextTag();SetTextTagText(t,text,0.018);SetTextTagPos(t,x,y,115);SetTextTagColor(t,197,212,171,230);SetTextTagPermanent(t,true)
end
function AH_Capture(i)
    AH.strikes[i]=AH.strikes[i]+1
    if AH.strikes[i]>=3 then
        AH.exhausted[i]=true;ShowUnit(AH.workers[i],false);PauseUnit(AH.workers[i],true)
        AH_Say('Worker '..(i+1)..' did not return to reception. The remaining workers can still leave.')
    else
        SetUnitPosition(AH.workers[i],AH_STARTS[i+1][1],AH_STARTS[i+1][2]);AH.stamina[i]=100;AH.protectedUntil[i]=AH.clock+8
        DisplayTimedTextToPlayer(Player(i),0,0,7,'You wake at reception. Capture '..AH.strikes[i]..'/3. The recovered fuses are still in the team bag.')
    end
end
function AH_Tick()
    if AH.ended then return end
    AH.clock=AH.clock+0.25
    if AH.clock>=600 then AH_Finish(false,'The building has ended your shift. Nobody heard the last announcement.');return end
    local dark=not AH.powered and AH.clock%45>=35
    if dark~=AH.dark then
        AH.dark=dark
        for _,u in ipairs(AH.fixtures) do SetUnitVertexColor(u,dark and 50 or 255,dark and 52 or 255,dark and 35 or 220,255) end
        SetSoundVolume(AH.hum,dark and 10 or 42)
        AH_Say(dark and 'The emergency lighting drops. Keep moving, or stay quiet.' or 'The fluorescent tubes come back one by one.')
    end
    local active=0
    for i=0,3 do
        if AH.active[i] and GetPlayerSlotState(Player(i))~=PLAYER_SLOT_STATE_PLAYING then
            AH.active[i]=false;if AH.workers[i] then RemoveUnit(AH.workers[i]) end
        end
        if AH_Valid(i) then
            active=active+1
            AH.stamina[i]=math.min(100,AH.stamina[i]+(AH.clock<AH.sprintUntil[i] and 0 or 2.5))
            SetUnitMoveSpeed(AH.workers[i],AH.clock<AH.sprintUntil[i] and 400 or (AH.quiet[i] and 170 or 260))
            SetPlayerState(Player(i),PLAYER_STATE_RESOURCE_GOLD,AH.collected)
            SetPlayerState(Player(i),PLAYER_STATE_RESOURCE_LUMBER,math.floor(AH.stamina[i]))
        end
    end
    if active==0 then AH_Finish(false,'Reception is empty. The Custodian switches off the lights.');return end
    if AH.clock%0.5~=0 then return end
    local mx,my=GetUnitX(AH.monster),GetUnitY(AH.monster)
    local chosen=nil;local best=999;local moveX,moveY=nil,nil
    for i=0,3 do
        if AH_Valid(i) then
            local x,y=GetUnitX(AH.workers[i]),GetUnitY(AH.workers[i])
            local safe=AH_Distance(x,y,AH_START[1],AH_START[2])<210 or AH.clock<AH.protectedUntil[i]
            if not safe then
                local nx,ny,steps=AH_NextPoint(mx,my,x,y)
                local hearing=AH.clock<AH.sprintUntil[i] and 7 or (AH.quiet[i] and 2 or 4)
                if AH.powered then hearing=9 end
                if nx and steps<=hearing and steps<best then chosen=i;best=steps;moveX,moveY=nx,ny end
                if steps<=1 and AH_Distance(mx,my,x,y)<72 then AH_Capture(i) end
            end
        end
    end
    SetUnitMoveSpeed(AH.monster,AH.powered and 295 or (AH.dark and 285 or 215))
    if chosen==nil then
        local p=AH_PATROL[AH.patrol]
        if AH_Distance(mx,my,p[1],p[2])<64 then AH.patrol=AH.patrol%#AH_PATROL+1;p=AH_PATROL[AH.patrol] end
        moveX,moveY=AH_NextPoint(mx,my,p[1],p[2])
    end
    if moveX then IssuePointOrder(AH.monster,'move',moveX,moveY) end
end
function config()
    SetMapName('After Hours: Emergency Lighting');SetMapDescription('Find three fuses. Restore power. Leave together.')
    SetPlayers(4);SetTeams(1);SetGamePlacement(MAP_PLACEMENT_USE_MAP_SETTINGS)
    for i=0,3 do
        local p=Player(i);local s=AH_STARTS[i+1]
        DefineStartLocation(i,s[1],s[2]);SetPlayerStartLocation(p,i);ForcePlayerStartLocation(p,i)
        SetPlayerColor(p,ConvertPlayerColor(i));SetPlayerRacePreference(p,RACE_PREF_HUMAN)
        SetPlayerRaceSelectable(p,false);SetPlayerController(p,MAP_CONTROL_USER);SetPlayerTeam(p,0)
    end
end
function main()
    InitBlizzard();CreateAllUnits()
    AH={clock=0,ended=false,won=false,active={},workers={},stamina={},quiet={},sprintUntil={},sprintReady={},strikes={},exhausted={},protectedUntil={},fuseUnits={},taken={},collected=0,powered=false,dark=false,fixtures={},patrol=1}
    SetTimeOfDay(0);SetTimeOfDayScale(0)
    SetCameraBounds(-1792,-1792,1792,1792,-1792,1792,1792,-1792)
    local scenery=Player(PLAYER_NEUTRAL_PASSIVE)
    for r,row in ipairs(AH_LAYOUT) do
        for c=1,15 do
            local x,y=-1792+(c-1)*256,1792-(r-1)*256
            if string.sub(row,c,c)=='#' then
                CreateUnit(scenery,UNIT_WALL,x,y,0)
            else
                CreateUnit(scenery,UNIT_CARPET,x,y,0)
                if (r+c)%3==0 then AH.fixtures[#AH.fixtures+1]=CreateUnit(scenery,UNIT_FIXTURE,x,y,0) end
            end
        end
    end
    for n,p in ipairs(AH_FUSES) do AH.fuseUnits[n]=CreateUnit(scenery,UNIT_FUSE,p[1],p[2],0) end
    AH.generator=CreateUnit(scenery,UNIT_GENERATOR,AH_GENERATOR[1],AH_GENERATOR[2],0)
    AH.exit=CreateUnit(scenery,UNIT_EXIT,AH_EXIT[1],AH_EXIT[2],0)
    AH.monster=CreateUnit(Player(PLAYER_NEUTRAL_AGGRESSIVE),UNIT_CUSTODIAN,AH_MONSTER_START[1],AH_MONSTER_START[2],270)
    AH_Label('RECEPTION',AH_START[1],AH_START[2]);AH_Label('MAINTENANCE',AH_GENERATOR[1],AH_GENERATOR[2]);AH_Label('EXIT',AH_EXIT[1],AH_EXIT[2])
    local spells=CreateTrigger();local chat=CreateTrigger()
    for i=0,3 do
        local p=Player(i);local s=AH_STARTS[i+1]
        AH.active[i]=GetPlayerSlotState(p)==PLAYER_SLOT_STATE_PLAYING and GetPlayerController(p)==MAP_CONTROL_USER
        AH.stamina[i]=100;AH.quiet[i]=false;AH.sprintUntil[i]=0;AH.sprintReady[i]=0;AH.strikes[i]=0;AH.protectedUntil[i]=8;AH.exhausted[i]=false
        if AH.active[i] then
            AH.workers[i]=CreateUnit(p,UNIT_NIGHT_SHIFT_WORKER,s[1],s[2],270)
            for j=0,3 do if i~=j then SetPlayerAlliance(p,Player(j),ALLIANCE_PASSIVE,true);SetPlayerAlliance(p,Player(j),ALLIANCE_SHARED_VISION,true) end end
            -- Camera and selection only: no local branch can change shared state.
            if GetLocalPlayer()==p then
                SelectUnit(AH.workers[i],true);SetCameraPosition(s[1],s[2]);SetCameraField(CAMERA_FIELD_TARGET_DISTANCE,1350,0)
                SetCameraField(CAMERA_FIELD_ANGLE_OF_ATTACK,65,0)
            end
            AH_Help(i)
        end
        TriggerRegisterPlayerUnitEvent(spells,p,EVENT_PLAYER_UNIT_SPELL_EFFECT,nil)
        TriggerRegisterPlayerChatEvent(chat,p,'-',false)
    end
    TriggerAddAction(spells,AH_Cast);TriggerAddAction(chat,AH_Chat)
    AH.hum=CreateSound('war3mapImported\\hum.wav',true,false,false,0,0,'DefaultEAXON');SetSoundVolume(AH.hum,42);StartSound(AH.hum)
    local timer=CreateTimer();TimerStart(timer,0.25,true,AH_Tick)
end
