//=========================================================================
//  VOICES -- GENERATED, DO NOT EDIT BY HAND
//
//  Source: docs/reference/fall-of-rome-voices.md
//  Generator: scripts/experimental/rome-ai/gen-voices.py
//
//  Twelve factions, three tiers. Tier A is per FACTION so that no two
//  factions can ever emit the same string -- the collision the owner saw
//  becomes impossible by construction rather than improbable. Tier B is
//  per house for lines that fire once or twice a game, and tier C is one
//  line per house per state because those fire on visible transitions.
//
//  Presentation only. No line adds information, every line still exits
//  through AI_Say -> AI_BroadcastAllies, and no voice helper is reachable
//  from AI_Tel, so the FORAI| machine channel stays byte-exact.
//=========================================================================

// V_OBJ_POINT = 0
// V_OBJ_CAPITAL = 1
// V_TAKEN = 2
// V_ABORT_HOME = 3
// V_ABORT_LOST = 4
// V_ABORT_TAKEN = 5
// V_ABORT_STALL = 6
// V_FORMED = 7
// V_TIMEOUT = 8
// V_RAID = 9

function AI_VA0 takes integer kind, integer v, string k, string o returns string
    if kind == 0 then
        if v == 0 then
            return "next is " + k + ". taking it from " + o
        elseif v == 1 then
            return "we ride on " + k + ". it is held by " + o
        elseif v == 2 then
            return "I want " + k + ". it belongs to " + o
        endif
    elseif kind == 1 then
        if v == 0 then
            return "the great city, then. it is held by " + o
        elseif v == 1 then
            return "I want the capital of " + o
        elseif v == 2 then
            return "we ride on the capital of " + o
        endif
    elseif kind == 2 then
        if v == 0 then
            return k + " is mine now"
        elseif v == 1 then
            return k + " taken. do not slow down"
        elseif v == 2 then
            return k + " is ours. next"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "home is burning. turn around"
        elseif v == 1 then
            return "someone is in my camp. back"
        elseif v == 2 then
            return "leave it. my own ground first"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "this one is lost. ride out"
        elseif v == 1 then
            return "no more of my men here. out"
        elseif v == 2 then
            return "let it go. we bled enough"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "someone else took it. fine"
        elseif v == 1 then
            return "beaten to it. find me another"
        elseif v == 2 then
            return "taken already. not by me"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "this is going nowhere. off"
        elseif v == 1 then
            return "we are wasting the day here"
        elseif v == 2 then
            return "enough of this. we ride elsewhere"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "everyone is here. go"
        elseif v == 1 then
            return "that is the lot. move"
        elseif v == 2 then
            return "good. now we ride"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "I am done waiting. the rest can catch up"
        elseif v == 1 then
            return "no more standing about. go"
        elseif v == 2 then
            return "we ride now, with who we have"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "burning " + k + " while they look the other way"
        elseif v == 1 then
            return "we take " + k + " behind their backs"
        elseif v == 2 then
            return "riders are on " + k + ". no one has noticed"
        endif
    endif
    return ""
endfunction

function AI_VA1 takes integer kind, integer v, string k, string o returns string
    if kind == 0 then
        if v == 0 then
            return "we take " + k + " next. held by " + o
        elseif v == 1 then
            return "marking " + k + " for us. it is " + o
        elseif v == 2 then
            return k + " then. it belongs to " + o
        endif
    elseif kind == 1 then
        if v == 0 then
            return "we go for the capital of " + o
        elseif v == 1 then
            return "the capital next. it is held by " + o
        elseif v == 2 then
            return "all of us on the capital of " + o
        endif
    elseif kind == 2 then
        if v == 0 then
            return k + " is ours. mark it"
        elseif v == 1 then
            return k + " taken. on to the next"
        elseif v == 2 then
            return "that is " + k + " done"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "home first. we turn back"
        elseif v == 1 then
            return "our own people need us. back"
        elseif v == 2 then
            return "leave it. there is trouble at home"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "this one is lost. pull out"
        elseif v == 1 then
            return "no sense dying here. out"
        elseif v == 2 then
            return "we cannot hold this. leave"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "an ally has it. good enough"
        elseif v == 1 then
            return "already taken. we look elsewhere"
        elseif v == 2 then
            return "someone got there first. fine"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "this is going nowhere. calling it off"
        elseif v == 1 then
            return "we are stuck. try somewhere else"
        elseif v == 2 then
            return "no progress here. we move on"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "all here. move out"
        elseif v == 1 then
            return "we are gathered. go"
        elseif v == 2 then
            return "that will do. forward"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "long enough. we go as we are"
        elseif v == 1 then
            return "stragglers can follow. moving"
        elseif v == 2 then
            return "no more waiting. out we go"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "we take " + k + " while they are busy"
        elseif v == 1 then
            return "horsemen are on " + k + " already"
        elseif v == 2 then
            return k + " is undefended. taking it"
        endif
    endif
    return ""
endfunction

function AI_VA2 takes integer kind, integer v, string k, string o returns string
    if kind == 0 then
        if v == 0 then
            return k + ". we go. held by " + o
        elseif v == 1 then
            return k + " next. from " + o
        elseif v == 2 then
            return k + ". take it off " + o
        endif
    elseif kind == 1 then
        if v == 0 then
            return "the capital. from " + o
        elseif v == 1 then
            return "we go. capital of " + o
        elseif v == 2 then
            return "capital next. it is " + o
        endif
    elseif kind == 2 then
        if v == 0 then
            return k + " taken"
        elseif v == 1 then
            return k + " ours"
        elseif v == 2 then
            return k + ". done"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "home. back now"
        elseif v == 1 then
            return "trouble at home. we turn"
        elseif v == 2 then
            return "our camp first. back"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "lost. out"
        elseif v == 1 then
            return "no. we leave"
        elseif v == 2 then
            return "done here. out"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "taken. someone else"
        elseif v == 1 then
            return "not ours. find another"
        elseif v == 2 then
            return "beaten to it"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "nothing doing. off"
        elseif v == 1 then
            return "stuck. we go"
        elseif v == 2 then
            return "no. elsewhere"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "all here. move"
        elseif v == 1 then
            return "ready. go"
        elseif v == 2 then
            return "formed. out"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "waited enough. go"
        elseif v == 1 then
            return "no more. move"
        elseif v == 2 then
            return "we go. now"
        endif
    elseif kind == 9 then
        if v == 0 then
            return k + ". while they look away"
        elseif v == 1 then
            return "horse on " + k + ". quietly"
        elseif v == 2 then
            return "taking " + k + ". unwatched"
        endif
    endif
    return ""
endfunction

function AI_VA3 takes integer kind, integer v, string k, string o returns string
    if kind == 0 then
        if v == 0 then
            return "the field army moves on " + k + ". held by " + o
        elseif v == 1 then
            return "orders are for " + k + ". it belongs to " + o
        elseif v == 2 then
            return k + " is the priority. held by " + o
        endif
    elseif kind == 1 then
        if v == 0 then
            return "the field army marches on the capital of " + o
        elseif v == 1 then
            return "we take back the capital of " + o
        elseif v == 2 then
            return "the capital, then. it is held by " + o
        endif
    elseif kind == 2 then
        if v == 0 then
            return k + " is back under Roman order"
        elseif v == 1 then
            return k + " recovered. record it"
        elseif v == 2 then
            return "that is " + k + " restored"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "we are needed at home. turn about"
        elseif v == 1 then
            return "the province is threatened. back"
        elseif v == 2 then
            return "leave it. we cannot lose the interior"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "this position is lost. withdraw"
        elseif v == 1 then
            return "we cannot hold it. pull them out"
        elseif v == 2 then
            return "write it off. save the men"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "another hand has it. very well"
        elseif v == 1 then
            return "taken already. we turn elsewhere"
        elseif v == 2 then
            return "it is done without us. good"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "this is achieving nothing. break off"
        elseif v == 1 then
            return "we are spending men for no ground"
        elseif v == 2 then
            return "call it off. there is better work"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "the column is formed. advance"
        elseif v == 1 then
            return "ranks are made. we march"
        elseif v == 2 then
            return "assembled. forward"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "we will wait no longer. advance as we are"
        elseif v == 1 then
            return "the hour is past. march with those here"
        elseif v == 2 then
            return "enough delay. forward"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "cavalry are detached against " + k
        elseif v == 1 then
            return "we strike " + k + " while they are engaged"
        elseif v == 2 then
            return "a squadron takes " + k + " behind them"
        endif
    endif
    return ""
endfunction

function AI_VA4 takes integer kind, integer v, string k, string o returns string
    if kind == 0 then
        if v == 0 then
            return k + " is owed to us. it is held by " + o
        elseif v == 1 then
            return "we go to " + k + ". it is held by " + o
        elseif v == 2 then
            return k + " will be ours. taken from " + o
        endif
    elseif kind == 1 then
        if v == 0 then
            return "the capital is owed to us. held by " + o
        elseif v == 1 then
            return "we march on the capital of " + o
        elseif v == 2 then
            return "the great prize, then. held by " + o
        endif
    elseif kind == 2 then
        if v == 0 then
            return k + " is ours by right"
        elseif v == 1 then
            return k + " taken. as it should be"
        elseif v == 2 then
            return "that is " + k + " in our hands"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "our own land is touched. back"
        elseif v == 1 then
            return "home is threatened. we return"
        elseif v == 2 then
            return "leave it. no one raids us"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "there is no honour here. out"
        elseif v == 1 then
            return "this is lost. we go"
        elseif v == 2 then
            return "enough. we do not die for this"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "another has taken it. so be it"
        elseif v == 1 then
            return "the prize is gone. find another"
        elseif v == 2 then
            return "taken. we were not needed"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "this achieves nothing. away"
        elseif v == 1 then
            return "we gain no ground. break off"
        elseif v == 2 then
            return "call it off. there is better"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "the host is gathered. we go"
        elseif v == 1 then
            return "all are come. forward"
        elseif v == 2 then
            return "we are ready. onward"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "we have waited long enough. we go"
        elseif v == 1 then
            return "no more delay. those here will do"
        elseif v == 2 then
            return "we move, ready or not"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "we take " + k + " while their backs are turned"
        elseif v == 1 then
            return "riders on " + k + ". easy work"
        elseif v == 2 then
            return k + " is theirs no longer"
        endif
    endif
    return ""
endfunction

function AI_VA5 takes integer kind, integer v, string k, string o returns string
    if kind == 0 then
        if v == 0 then
            return "we move quickly on " + k + ". held by " + o
        elseif v == 1 then
            return k + " is open. it belongs to " + o
        elseif v == 2 then
            return "take " + k + " before they look. it is " + o
        endif
    elseif kind == 1 then
        if v == 0 then
            return "the capital, and quickly. held by " + o
        elseif v == 1 then
            return "we move on the capital of " + o
        elseif v == 2 then
            return "the capital is open. it is held by " + o
        endif
    elseif kind == 2 then
        if v == 0 then
            return k + " taken. we were quick"
        elseif v == 1 then
            return k + " is ours. do not settle in"
        elseif v == 2 then
            return "that is " + k + ". keep moving"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "home is exposed. we turn back"
        elseif v == 1 then
            return "our coast is threatened. back"
        elseif v == 2 then
            return "leave it. the port comes first"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "this is lost. move before we are"
        elseif v == 1 then
            return "no ground is worth this. out"
        elseif v == 2 then
            return "we leave. quickly"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "someone was faster. rare"
        elseif v == 1 then
            return "already gone. find another"
        elseif v == 2 then
            return "taken. we lose nothing"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "we are stuck. that is not our way"
        elseif v == 1 then
            return "no ground here. away"
        elseif v == 2 then
            return "calling it off. speed elsewhere"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "all up. we move"
        elseif v == 1 then
            return "gathered. quickly now"
        elseif v == 2 then
            return "ready. go before they are"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "no more waiting. we go light"
        elseif v == 1 then
            return "the rest can follow. moving"
        elseif v == 2 then
            return "we go now. speed is the point"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "we are already on " + k
        elseif v == 1 then
            return "riders take " + k + " before they turn"
        elseif v == 2 then
            return k + " falls while they look elsewhere"
        endif
    endif
    return ""
endfunction

function AI_VA6 takes integer kind, integer v, string k, string o returns string
    if kind == 0 then
        if v == 0 then
            return k + " it is. not much choice. held by " + o
        elseif v == 1 then
            return "we try for " + k + ". it belongs to " + o
        elseif v == 2 then
            return k + " is within reach. held by " + o
        endif
    elseif kind == 1 then
        if v == 0 then
            return "the capital, if we can reach it. held by " + o
        elseif v == 1 then
            return "we try for the capital of " + o
        elseif v == 2 then
            return "the great city, then. held by " + o
        endif
    elseif kind == 2 then
        if v == 0 then
            return k + " taken. that is rare enough"
        elseif v == 1 then
            return k + " is ours. we keep it"
        elseif v == 2 then
            return "that is " + k + " won"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "home needs us. we have little to spare"
        elseif v == 1 then
            return "back. we cannot lose what we hold"
        elseif v == 2 then
            return "leave it. our own ground first"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "this is lost. we cannot spend men so"
        elseif v == 1 then
            return "out. we have too few for this"
        elseif v == 2 then
            return "let it go. we keep the rest"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "someone else has it. fewer of ours die"
        elseif v == 1 then
            return "already taken. just as well"
        elseif v == 2 then
            return "gone. we look nearer home"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "this is going nowhere. back to it later"
        elseif v == 1 then
            return "no ground gained. we stop"
        elseif v == 2 then
            return "calling it off. no sense in it"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "everyone we have is here. go"
        elseif v == 1 then
            return "that is all of us. move"
        elseif v == 2 then
            return "gathered. such as we are"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "we go with what came. it is enough"
        elseif v == 1 then
            return "no more waiting. we are few anyway"
        elseif v == 2 then
            return "off we go. the rest can follow"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "horse are on " + k + ". quietly"
        elseif v == 1 then
            return "we take " + k + " while no one watches"
        elseif v == 2 then
            return k + " is unwatched. taking it"
        endif
    endif
    return ""
endfunction

function AI_VA7 takes integer kind, integer v, string k, string o returns string
    if kind == 0 then
        if v == 0 then
            return "we will have " + k + ". it is held by " + o
        elseif v == 1 then
            return k + " is marked. it belongs to " + o
        elseif v == 2 then
            return "the host turns to " + k + ". held by " + o
        endif
    elseif kind == 1 then
        if v == 0 then
            return "the capital will be ours. held by " + o
        elseif v == 1 then
            return "the host marches on the capital of " + o
        elseif v == 2 then
            return "we turn to the capital of " + o
        endif
    elseif kind == 2 then
        if v == 0 then
            return k + " is added to us"
        elseif v == 1 then
            return k + " taken. quickly, as intended"
        elseif v == 2 then
            return "that is " + k + ". ours"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "our own cities call. we return"
        elseif v == 1 then
            return "back. the east is not to be left"
        elseif v == 2 then
            return "leave it. home has the first claim"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "this is lost. withdraw in order"
        elseif v == 1 then
            return "we spend no more here. out"
        elseif v == 2 then
            return "let it go. there is no profit"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "another has taken it. no matter"
        elseif v == 1 then
            return "it is done. we choose again"
        elseif v == 2 then
            return "taken already. we lose nothing"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "nothing is gained here. break off"
        elseif v == 1 then
            return "we make no ground. enough"
        elseif v == 2 then
            return "call it off. we go elsewhere"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "the host is gathered. we ride"
        elseif v == 1 then
            return "all are come. let us go"
        elseif v == 2 then
            return "the host is ready. onward"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "we have waited long enough. we ride"
        elseif v == 1 then
            return "no more delay. those here suffice"
        elseif v == 2 then
            return "we go, ready or not"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "horse are sent against " + k
        elseif v == 1 then
            return "we take " + k + " while they attend elsewhere"
        elseif v == 2 then
            return k + " falls to the riders"
        endif
    endif
    return ""
endfunction

function AI_VA8 takes integer kind, integer v, string k, string o returns string
    if kind == 0 then
        if v == 0 then
            return "we take " + k + " and stand on it. held by " + o
        elseif v == 1 then
            return k + " will do. held by " + o
        elseif v == 2 then
            return "we set ourselves at " + k + ". held by " + o
        endif
    elseif kind == 1 then
        if v == 0 then
            return "we set ourselves at the capital of " + o
        elseif v == 1 then
            return "the capital, then. held by " + o
        elseif v == 2 then
            return "the capital of " + o + ". we go"
        endif
    elseif kind == 2 then
        if v == 0 then
            return k + " taken. it will hold"
        elseif v == 1 then
            return k + " is ours. we stay on it"
        elseif v == 2 then
            return "that is " + k + " secured"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "home is struck. we go back"
        elseif v == 1 then
            return "our ground is threatened. back"
        elseif v == 2 then
            return "leave it. we defend our own"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "this cannot be held. out"
        elseif v == 1 then
            return "we withdraw. no shame in it"
        elseif v == 2 then
            return "lost. we go back in order"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "another has it. good"
        elseif v == 1 then
            return "taken before us. we pick again"
        elseif v == 2 then
            return "done without us. no matter"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "we gain nothing standing here"
        elseif v == 1 then
            return "no ground. we break off"
        elseif v == 2 then
            return "call it off. elsewhere then"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "the line is formed. advance"
        elseif v == 1 then
            return "all here. we move together"
        elseif v == 2 then
            return "ready. forward, steady"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "long enough. we advance as we stand"
        elseif v == 1 then
            return "no more waiting. the line moves"
        elseif v == 2 then
            return "we go now. the rest will find us"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "riders take " + k + " while they look away"
        elseif v == 1 then
            return "we take " + k + " unopposed"
        elseif v == 2 then
            return k + " is lightly held. taking it"
        endif
    endif
    return ""
endfunction

function AI_VA9 takes integer kind, integer v, string k, string o returns string
    if kind == 0 then
        if v == 0 then
            return "the army is directed at " + k + ". held by " + o
        elseif v == 1 then
            return k + " is assigned to us. held by " + o
        elseif v == 2 then
            return "we move on " + k + ". it belongs to " + o
        endif
    elseif kind == 1 then
        if v == 0 then
            return "the army is directed at the capital of " + o
        elseif v == 1 then
            return "we recover the capital of " + o
        elseif v == 2 then
            return "we proceed to the capital of " + o
        endif
    elseif kind == 2 then
        if v == 0 then
            return k + " is under our administration"
        elseif v == 1 then
            return k + " recovered. enter it in the rolls"
        elseif v == 2 then
            return "that is " + k + " accounted for"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "the interior is threatened. we return"
        elseif v == 1 then
            return "back. Constantinople comes first"
        elseif v == 2 then
            return "leave it. we will not be cut off"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "the position is untenable. withdraw"
        elseif v == 1 then
            return "we will not spend the army here"
        elseif v == 2 then
            return "write it off. keep the field army"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "it is in friendly hands. very well"
        elseif v == 1 then
            return "already taken. we reassign"
        elseif v == 2 then
            return "done without us. good"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "no ground for the cost. break off"
        elseif v == 1 then
            return "this is unprofitable. we withdraw"
        elseif v == 2 then
            return "call it off. reassign the army"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "the army is assembled. march"
        elseif v == 1 then
            return "ranks made. proceed"
        elseif v == 2 then
            return "the column stands ready. advance"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "we march with those assembled"
        elseif v == 1 then
            return "the hour is past. advance"
        elseif v == 2 then
            return "no further delay. proceed"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "cavalry are sent against " + k
        elseif v == 1 then
            return "we take " + k + " while their eyes are elsewhere"
        elseif v == 2 then
            return "a detachment takes " + k
        endif
    endif
    return ""
endfunction

function AI_VA10 takes integer kind, integer v, string k, string o returns string
    if kind == 0 then
        if v == 0 then
            return "we buy time at " + k + ". held by " + o
        elseif v == 1 then
            return k + " will cost them a while. held by " + o
        elseif v == 2 then
            return "we go to " + k + ". it belongs to " + o
        endif
    elseif kind == 1 then
        if v == 0 then
            return "the capital. it buys the most time. held by " + o
        elseif v == 1 then
            return "we spend ourselves at the capital of " + o
        elseif v == 2 then
            return "the capital of " + o + ", while we still can"
        endif
    elseif kind == 2 then
        if v == 0 then
            return k + " taken. that is time bought"
        elseif v == 1 then
            return k + " is ours for now"
        elseif v == 2 then
            return "that is " + k + " held a while longer"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "our own line is thin. we go back"
        elseif v == 1 then
            return "back. we hold the road or no one does"
        elseif v == 2 then
            return "leave it. the allies need the line"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "this is lost. spend the men better"
        elseif v == 1 then
            return "out. we are worth more elsewhere"
        elseif v == 2 then
            return "let it go. we have no city to lose"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "another has it. that suits us"
        elseif v == 1 then
            return "taken. our time is better spent"
        elseif v == 2 then
            return "done. we were only the delay"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "we buy nothing here. break off"
        elseif v == 1 then
            return "no time gained. call it off"
        elseif v == 2 then
            return "this delays no one. we move"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "the column is formed. march"
        elseif v == 1 then
            return "we are assembled. move"
        elseif v == 2 then
            return "ready. we go while we can"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "we cannot wait. march as we stand"
        elseif v == 1 then
            return "time is what we sell. moving"
        elseif v == 2 then
            return "no more delay. advance"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "horse are on " + k + " while we still can"
        elseif v == 1 then
            return "we take " + k + " to stretch them"
        elseif v == 2 then
            return k + " taken. it buys an hour"
        endif
    endif
    return ""
endfunction

function AI_VA11 takes integer kind, integer v, string k, string o returns string
    if kind == 0 then
        if v == 0 then
            return "we all go to " + k + ". held by " + o
        elseif v == 1 then
            return k + " next. it belongs to " + o
        elseif v == 2 then
            return "the band moves on " + k + ". held by " + o
        endif
    elseif kind == 1 then
        if v == 0 then
            return "all of us to the capital of " + o
        elseif v == 1 then
            return "the band goes for the capital of " + o
        elseif v == 2 then
            return "the capital of " + o + ". together"
        endif
    elseif kind == 2 then
        if v == 0 then
            return k + " taken. together, as always"
        elseif v == 1 then
            return k + " is ours"
        elseif v == 2 then
            return "that is " + k + ". no one fell alone"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "home calls. we all go back"
        elseif v == 1 then
            return "our people are threatened. back"
        elseif v == 2 then
            return "leave it. we do not leave them"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "this is lost. we go together"
        elseif v == 1 then
            return "out. we lose no more of ours"
        elseif v == 2 then
            return "let it go. the band comes first"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "another has it. we share the gain"
        elseif v == 1 then
            return "taken. no loss to us"
        elseif v == 2 then
            return "already done. we look elsewhere"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "we gain nothing. all of us, off"
        elseif v == 1 then
            return "no ground here. calling it off"
        elseif v == 2 then
            return "this is going nowhere. we move"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "all of us here. move"
        elseif v == 1 then
            return "the band is whole. go"
        elseif v == 2 then
            return "no one left behind. forward"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "we go together, with who came"
        elseif v == 1 then
            return "no more waiting. the band moves"
        elseif v == 2 then
            return "off we go. the rest will find us"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "riders are on " + k
        elseif v == 1 then
            return "we take " + k + " while they look elsewhere"
        elseif v == 2 then
            return k + " is ours quietly"
        endif
    endif
    return ""
endfunction

function AI_VTierA takes integer pid, integer kind, integer v, string k, string o returns string
    if pid == 0 then
        return AI_VA0(kind, v, k, o)
    elseif pid == 1 then
        return AI_VA1(kind, v, k, o)
    elseif pid == 2 then
        return AI_VA2(kind, v, k, o)
    elseif pid == 3 then
        return AI_VA3(kind, v, k, o)
    elseif pid == 4 then
        return AI_VA4(kind, v, k, o)
    elseif pid == 5 then
        return AI_VA5(kind, v, k, o)
    elseif pid == 6 then
        return AI_VA6(kind, v, k, o)
    elseif pid == 7 then
        return AI_VA7(kind, v, k, o)
    elseif pid == 8 then
        return AI_VA8(kind, v, k, o)
    elseif pid == 9 then
        return AI_VA9(kind, v, k, o)
    elseif pid == 10 then
        return AI_VA10(kind, v, k, o)
    elseif pid == 11 then
        return AI_VA11(kind, v, k, o)
    endif
    return ""
endfunction

function AI_VB0 takes integer kind, integer v returns string
    if kind == 0 then
        if v == 0 then
            return "nothing worth much here. I take the nearest"
        elseif v == 1 then
            return "no great prize about. the nearest will do"
        elseif v == 2 then
            return "thin pickings. we take what is close"
        endif
    elseif kind == 1 then
        if v == 0 then
            return "my lot are scattered. pulling them in"
        elseif v == 1 then
            return "we are strung out. gather up"
        elseif v == 2 then
            return "too spread out. form up"
        endif
    elseif kind == 2 then
        if v == 0 then
            return "we are getting nowhere. open that gate"
        elseif v == 1 then
            return "the gate. open it and be done"
        elseif v == 2 then
            return "no more of this. get the gate open"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "get him out. I cannot buy another"
        elseif v == 1 then
            return "pull him back before he falls"
        elseif v == 2 then
            return "he is done. bring him home"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "kill their champion first"
        elseif v == 1 then
            return "their leader. him first"
        elseif v == 2 then
            return "take the big one down"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "that is over water. we need a boat"
        elseif v == 1 then
            return "no walking there. find a ship"
        elseif v == 2 then
            return "water in the way. a boat then"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "everyone on the boat"
        elseif v == 1 then
            return "aboard, all of you"
        elseif v == 2 then
            return "get on. we cross"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "ashore. that was the hard part"
        elseif v == 1 then
            return "we are across. off the boat"
        elseif v == 2 then
            return "land. now we ride"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "crossing is off. bring the boat back"
        elseif v == 1 then
            return "no crossing. turn it around"
        elseif v == 2 then
            return "forget the water. back"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "I could use a hand here"
        elseif v == 1 then
            return "come in on my side of this"
        elseif v == 2 then
            return "send what you can spare"
        endif
    endif
    return ""
endfunction

function AI_VB1 takes integer kind, integer v returns string
    if kind == 0 then
        if v == 0 then
            return "nothing here is worth much. we take the nearest"
        elseif v == 1 then
            return "no better target. the closest will do"
        elseif v == 2 then
            return "we take what is near and move on"
        endif
    elseif kind == 1 then
        if v == 0 then
            return "we are spread out. pulling in"
        elseif v == 1 then
            return "the men are scattered. gathering"
        elseif v == 2 then
            return "too far apart. form up"
        endif
    elseif kind == 2 then
        if v == 0 then
            return "we are stuck. open that gate"
        elseif v == 1 then
            return "get the gate open"
        elseif v == 2 then
            return "the gate first. open it"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "get him out. we cannot replace him"
        elseif v == 1 then
            return "pull him out now"
        elseif v == 2 then
            return "he is hurt. bring him back"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "their leader first"
        elseif v == 1 then
            return "put their champion down"
        elseif v == 2 then
            return "the leader. take him"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "that is across water. we need a boat"
        elseif v == 1 then
            return "we cannot walk there. a ship then"
        elseif v == 2 then
            return "water in the way. find a boat"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "everyone aboard"
        elseif v == 1 then
            return "on the boat, all of you"
        elseif v == 2 then
            return "get on. we are crossing"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "ashore. the worst is behind us"
        elseif v == 1 then
            return "we are across"
        elseif v == 2 then
            return "land under us again. move"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "no crossing after all. bring the boat back"
        elseif v == 1 then
            return "no crossing now. turn back"
        elseif v == 2 then
            return "forget it. back to land"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "we could use help here"
        elseif v == 1 then
            return "a hand here if you have one"
        elseif v == 2 then
            return "send men if you can"
        endif
    endif
    return ""
endfunction

function AI_VB2 takes integer kind, integer v returns string
    if kind == 0 then
        if v == 0 then
            return "nothing of worth here. we take the nearest"
        elseif v == 1 then
            return "no prize about. the closest will serve"
        elseif v == 2 then
            return "we take what is near and go on"
        endif
    elseif kind == 1 then
        if v == 0 then
            return "the host is scattered. gathering it"
        elseif v == 1 then
            return "we are strung out. close up"
        elseif v == 2 then
            return "too far apart. form the host"
        endif
    elseif kind == 2 then
        if v == 0 then
            return "we make no ground. open that gate"
        elseif v == 1 then
            return "the gate. have it opened"
        elseif v == 2 then
            return "open the gate and be done"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "bring him out. he cannot be replaced"
        elseif v == 1 then
            return "withdraw him at once"
        elseif v == 2 then
            return "he is spent. bring him home"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "their champion first"
        elseif v == 1 then
            return "kill their leader first"
        elseif v == 2 then
            return "the leader. before anything else"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "that lies over water. we need a ship"
        elseif v == 1 then
            return "no road there. a ship then"
        elseif v == 2 then
            return "water in the way. find a ship"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "every man aboard"
        elseif v == 1 then
            return "the host embarks"
        elseif v == 2 then
            return "on the ship. we cross"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "ashore. the hard part is done"
        elseif v == 1 then
            return "we are across. close up"
        elseif v == 2 then
            return "land. onward"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "the crossing is off. recall the ship"
        elseif v == 1 then
            return "no crossing. bring it back"
        elseif v == 2 then
            return "the water is not worth it. back"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "your help would be welcome here"
        elseif v == 1 then
            return "send such men as you can spare"
        elseif v == 2 then
            return "we would take assistance"
        endif
    endif
    return ""
endfunction

function AI_VB3 takes integer kind, integer v returns string
    if kind == 0 then
        if v == 0 then
            return "nothing of value here. take the nearest"
        elseif v == 1 then
            return "no priority stands out. the nearest then"
        elseif v == 2 then
            return "we take what is close and move on"
        endif
    elseif kind == 1 then
        if v == 0 then
            return "the army is scattered. re-forming"
        elseif v == 1 then
            return "the ranks are broken up. gathering"
        elseif v == 2 then
            return "too dispersed. form up"
        endif
    elseif kind == 2 then
        if v == 0 then
            return "we make no progress. open that gate"
        elseif v == 1 then
            return "the gate is to be opened"
        elseif v == 2 then
            return "open the gate. we are wasting time"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "get the general out. he cannot be replaced"
        elseif v == 1 then
            return "withdraw the general at once"
        elseif v == 2 then
            return "the general is spent. bring him back"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "their commander first"
        elseif v == 1 then
            return "bring their champion down first"
        elseif v == 2 then
            return "the leader. deal with him first"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "that is across water. we require a ship"
        elseif v == 1 then
            return "no land route. arrange a ship"
        elseif v == 2 then
            return "water in the way. we need shipping"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "the army embarks"
        elseif v == 1 then
            return "aboard the ships, all of you"
        elseif v == 2 then
            return "on the ships. we cross"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "ashore. the difficult part is done"
        elseif v == 1 then
            return "we are across. re-form and proceed"
        elseif v == 2 then
            return "landed. proceed"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "the crossing is cancelled. recall the ship"
        elseif v == 1 then
            return "no crossing. the ship returns"
        elseif v == 2 then
            return "abandon the crossing. return"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "we need support here"
        elseif v == 1 then
            return "we need men here, if any can be spared"
        elseif v == 2 then
            return "assistance here would be welcome"
        endif
    endif
    return ""
endfunction

function AI_VB4 takes integer kind, integer v returns string
    if kind == 0 then
        if v == 0 then
            return "nothing of value stands out. take the nearest"
        elseif v == 1 then
            return "no priority here. the closest will do"
        elseif v == 2 then
            return "we take the nearest and reassign later"
        endif
    elseif kind == 1 then
        if v == 0 then
            return "the army is dispersed. re-forming"
        elseif v == 1 then
            return "the column has come apart. gathering"
        elseif v == 2 then
            return "too scattered. close ranks"
        endif
    elseif kind == 2 then
        if v == 0 then
            return "we are making no progress. open that gate"
        elseif v == 1 then
            return "have the gate opened"
        elseif v == 2 then
            return "the gate. open it and proceed"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "withdraw the general. he is not replaceable"
        elseif v == 1 then
            return "get the general out now"
        elseif v == 2 then
            return "the general is spent. recall him"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "their commander before the rest"
        elseif v == 1 then
            return "the champion. him first"
        elseif v == 2 then
            return "their leader is to be killed first"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "that lies over water. arrange a crossing"
        elseif v == 1 then
            return "there is no road to it. a ship"
        elseif v == 2 then
            return "water in the way. we will need shipping"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "aboard. we cross"
        elseif v == 1 then
            return "the column embarks"
        elseif v == 2 then
            return "on the ships. cross"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "ashore. the crossing is done"
        elseif v == 1 then
            return "we are landed. form up"
        elseif v == 2 then
            return "across. proceed"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "the crossing is abandoned. recall the ship"
        elseif v == 1 then
            return "no crossing. return the ship"
        elseif v == 2 then
            return "stand down the crossing"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "support would be welcome here"
        elseif v == 1 then
            return "send whatever can be spared"
        elseif v == 2 then
            return "we ask for men here"
        endif
    endif
    return ""
endfunction

function AI_VB5 takes integer kind, integer v returns string
    if kind == 0 then
        if v == 0 then
            return "nothing worth the time. take the nearest"
        elseif v == 1 then
            return "no prize here. the closest buys as much"
        elseif v == 2 then
            return "we take what is near. it costs them the same"
        endif
    elseif kind == 1 then
        if v == 0 then
            return "the column is coming apart. gathering"
        elseif v == 1 then
            return "we are too scattered to hold. form up"
        elseif v == 2 then
            return "pulling them back together"
        endif
    elseif kind == 2 then
        if v == 0 then
            return "we are held up. open that gate"
        elseif v == 1 then
            return "open the gate. every minute counts"
        elseif v == 2 then
            return "the gate. open it now"
        endif
    elseif kind == 3 then
        if v == 0 then
            return "get the general out. we have little else"
        elseif v == 1 then
            return "withdraw him. we cannot replace him"
        elseif v == 2 then
            return "the general is spent. pull him back"
        endif
    elseif kind == 4 then
        if v == 0 then
            return "kill their leader. it buys time"
        elseif v == 1 then
            return "the champion first. it slows them"
        elseif v == 2 then
            return "take their leader down"
        endif
    elseif kind == 5 then
        if v == 0 then
            return "that is over water. we need shipping"
        elseif v == 1 then
            return "no road there. find a ship"
        elseif v == 2 then
            return "water in the way. a ship then"
        endif
    elseif kind == 6 then
        if v == 0 then
            return "aboard. we are crossing"
        elseif v == 1 then
            return "on the ships"
        elseif v == 2 then
            return "embark. quickly"
        endif
    elseif kind == 7 then
        if v == 0 then
            return "ashore. now we hold something"
        elseif v == 1 then
            return "landed. dig in"
        elseif v == 2 then
            return "across. we hold here"
        endif
    elseif kind == 8 then
        if v == 0 then
            return "the crossing is off. we need the ship elsewhere"
        elseif v == 1 then
            return "no crossing. bring them back"
        elseif v == 2 then
            return "stand down. no crossing"
        endif
    elseif kind == 9 then
        if v == 0 then
            return "we cannot hold this alone"
        elseif v == 1 then
            return "send men. we are buying time here"
        elseif v == 2 then
            return "help here, if you have any"
        endif
    endif
    return ""
endfunction

function AI_VTierB takes integer house, integer kind, integer v returns string
    if house == 0 then
        return AI_VB0(kind, v)
    elseif house == 1 then
        return AI_VB1(kind, v)
    elseif house == 2 then
        return AI_VB2(kind, v)
    elseif house == 3 then
        return AI_VB3(kind, v)
    elseif house == 4 then
        return AI_VB4(kind, v)
    elseif house == 5 then
        return AI_VB5(kind, v)
    endif
    return ""
endfunction

function AI_VTierC takes integer house, integer state returns string
    if state == 0 then
        if house == 0 then
            return "waiting. I hate waiting"
        elseif house == 1 then
            return "building up a bit first"
        elseif house == 2 then
            return "patience. the host grows"
        elseif house == 3 then
            return "we cannot hold everything. choosing"
        elseif house == 4 then
            return "we consolidate what is ours"
        elseif house == 5 then
            return "we have no capital. we have time to sell"
        endif
    elseif state == 1 then
        if house == 0 then
            return "right. who is next"
        elseif house == 1 then
            return "time to take something"
        elseif house == 2 then
            return "there is land to be had. I intend to have it"
        elseif house == 3 then
            return "we recover what we can"
        elseif house == 4 then
            return "the borders will be extended"
        elseif house == 5 then
            return "every hour we take is an hour they lose"
        endif
    elseif state == 2 then
        if house == 0 then
            return "someone is at my door and they will regret it"
        elseif house == 1 then
            return "trouble at home. dealing with it"
        elseif house == 2 then
            return "my house is threatened. that will be answered"
        elseif house == 3 then
            return "we hold. as we always have"
        elseif house == 4 then
            return "Constantinople will not be uncovered"
        elseif house == 5 then
            return "we hold the road. that is the job"
        endif
    elseif state == 3 then
        if house == 0 then
            return "enough raiding. I want a capital"
        elseif house == 1 then
            return "going for a capital"
        elseif house == 2 then
            return "the time is right. a capital, then"
        elseif house == 3 then
            return "the legions march on a capital"
        elseif house == 4 then
            return "the army moves against a capital"
        elseif house == 5 then
            return "if we take a capital, we end it"
        endif
    elseif state == 4 then
        if house == 0 then
            return "sharpening things"
        elseif house == 1 then
            return "upgrading the men"
        elseif house == 2 then
            return "better steel first, then war"
        elseif house == 3 then
            return "the armouries are at work"
        elseif house == 4 then
            return "the armouries are set to work"
        elseif house == 5 then
            return "better arms. we will need them"
        endif
    elseif state == 5 then
        if house == 0 then
            return "not today. back, all of you"
        elseif house == 1 then
            return "falling back"
        elseif house == 2 then
            return "we withdraw. there is no shame in it"
        elseif house == 3 then
            return "a withdrawal. it is not a rout"
        elseif house == 4 then
            return "we withdraw in order"
        elseif house == 5 then
            return "we fall back and keep the line"
        endif
    elseif state == 6 then
        if house == 0 then
            return "no more scraps. a throne"
        elseif house == 1 then
            return "thinking about a capital now"
        elseif house == 2 then
            return "a capital is within our reach"
        elseif house == 3 then
            return "we set ourselves against a capital"
        elseif house == 4 then
            return "we commit against a capital"
        elseif house == 5 then
            return "a capital, then. it is the only way out"
        endif
    elseif state == 7 then
        if house == 0 then
            return "I will bleed them at the edges"
        elseif house == 1 then
            return "working the edges"
        elseif house == 2 then
            return "we will trouble their edges"
        elseif house == 3 then
            return "their flanks are soft. we will use that"
        elseif house == 4 then
            return "we will work their flanks"
        elseif house == 5 then
            return "we stretch them. it costs them hours"
        endif
    elseif state == 8 then
        if house == 0 then
            return "fine. we wait and we grow"
        elseif house == 1 then
            return "tightening up"
        elseif house == 2 then
            return "we gather strength first"
        elseif house == 3 then
            return "we set our house in order"
        elseif house == 4 then
            return "we close ranks and hold"
        elseif house == 5 then
            return "we tighten the line"
        endif
    elseif state == 9 then
        if house == 0 then
            return "more land. always more land"
        elseif house == 1 then
            return "looking outward"
        elseif house == 2 then
            return "outward, and quickly"
        elseif house == 3 then
            return "outward, then"
        elseif house == 4 then
            return "we extend, carefully"
        elseif house == 5 then
            return "forward while we still can"
        endif
    endif
    return ""
endfunction

function AI_House takes integer pid returns integer
    if pid == 0 then
        return 0
    elseif pid == 1 then
        return 1
    elseif pid == 2 then
        return 1
    elseif pid == 3 then
        return 3
    elseif pid == 4 then
        return 0
    elseif pid == 5 then
        return 0
    elseif pid == 6 then
        return 1
    elseif pid == 7 then
        return 2
    elseif pid == 8 then
        return 0
    elseif pid == 9 then
        return 4
    elseif pid == 10 then
        return 5
    elseif pid == 11 then
        return 1
    endif
    return 1
endfunction
