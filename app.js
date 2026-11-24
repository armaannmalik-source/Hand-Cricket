(() => {
  const $ = id => document.getElementById(id);
  const screens = ["home","lobby","match","result"];
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("YOUR_") && !cfg.SUPABASE_ANON_KEY.includes("YOUR_");
  const db = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY) : null;
  let playerName = localStorage.getItem("hc_player_name") || "";
  
let playerId = sessionStorage.getItem("hc_player_id");

if (!playerId) {
  playerId = "player-" + Date.now() + "-" +
    Math.random().toString(36).substring(2, 12);

  sessionStorage.setItem("hc_player_id", playerId);
}

  let roomCode = null, roomState = null, channel = null, poller = null, pendingAction = null, myNumber = null;
  let isHost = false;

  function show(id){ screens.forEach(s=>$(s).classList.toggle("active",s===id)); }
  function msg(id,text){ $(id).textContent = text || ""; }
  function sayHome(text){ msg("homeMessage",text); }
  function needConfig(){ $("setupNotice").classList.remove("hidden"); }
  function ensureName(action){
    pendingAction = action;
    if (!playerName) { $("nameModal").classList.remove("hidden"); $("playerName").focus(); }
    else action();
  }
  $("saveNameBtn").onclick = () => {
    const value = $("playerName").value.trim().slice(0,16);
    if (!value) { msg("nameMessage","Please enter a name."); return; }
    playerName=value; localStorage.setItem("hc_player_name",value);
    $("nameModal").classList.add("hidden"); const a=pendingAction; pendingAction=null; if(a)a();
  };
  $("playerName").value = playerName;
  $("noticeClose").onclick = () => $("setupNotice").classList.add("hidden");
  document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>{cleanup();show(b.dataset.go);});

  function freshState(){
    return {host:{id:playerId,name:playerName},guest:null,phase:"lobby",oversLimit:2,
      innings:1,battingId:null,scores:{"1":0,"2":0},wickets:{"1":0,"2":0},balls:{"1":0,"2":0},
      target:null,picks:{},lastPicks:null,roundNo:0,winner:null,inningsBatter:{}};
  }
  function mySide(){return roomState?.host?.id===playerId?"host":"guest";}
  function opponent(){return mySide()==="host"?roomState?.guest:roomState?.host;}
  function sideForInnings(){return roomState.innings===1?"host":"guest";}
  function myBatting(){return roomState.battingId===playerId;}
  async function fetchRoom(code){
    const {data,error}=await db.from("rooms").select("state").eq("code",code).maybeSingle();
    if(error) throw error; return data?.state || null;
  }
  async function saveState(){
    roomState.updatedAt=Date.now();
    const {error}=await db.from("rooms").update({state:roomState,updated_at:new Date().toISOString()}).eq("code",roomCode);
    if(error) throw error;
  }
  async function createRoom(){
    if(!db){needConfig();return;}
    sayHome("Creating your room…");
    try{
      let code,ok=false;
      for(let i=0;i<8;i++){code=String(Math.floor(100000+Math.random()*900000));const {data}=await db.from("rooms").select("code").eq("code",code).maybeSingle();if(!data){ok=true;break;}}
      if(!ok)throw new Error("Couldn't create a code. Try again.");
      roomCode=code;isHost=true;roomState=freshState();
      const {error}=await db.from("rooms").insert({code,state:roomState});
      if(error)throw error;
      openLobby(); subscribe();
    }catch(e){sayHome(e.message||"Could not create room.");}
  }
  async function joinRoom(){
    if(!db){needConfig();return;}
    const code=$("joinCode").value.replace(/\D/g,"");
    if(code.length!==6){sayHome("Enter a valid 6-digit room code.");return;}
    sayHome("Joining room…");
    try{
      const state=await fetchRoom(code);
      if(!state){sayHome("Room not found. Check the code.");return;}
      if(state.guest && state.guest.id!==playerId){sayHome("This room already has two players.");return;}
      if(state.host.id===playerId){sayHome("You created this room on this browser.");return;}
      if(state.phase!=="lobby"){sayHome("This match has already started.");return;}
      roomCode=code;isHost=false;roomState=state;roomState.guest={id:playerId,name:playerName};await saveState();
      openLobby();subscribe();
    }catch(e){sayHome(e.message||"Could not join room.");}
  }
  function openLobby(){
    $("roomCodeDisplay").textContent=roomCode;$("hostName").textContent=roomState.host.name;
    refreshLobby();show("lobby");
  }
  function refreshLobby(){
    $("hostName").textContent=roomState.host.name;
    $("guestName").textContent=roomState.guest?.name||"Waiting for player…";
    $("guestStatus").textContent=roomState.guest?"Ready to play":"Share your code to invite a friend";
    $("guestTag").textContent=roomState.guest?"CONNECTED":"WAITING";
    $("startMatchBtn").disabled=!(roomState.host&&roomState.guest);
    $("startMatchBtn").textContent=roomState.guest?"Start match":"Waiting for opponent";
  }
  function subscribe(){
    if(channel)db.removeChannel(channel);
    channel=db.channel("room-"+roomCode).on("postgres_changes",{event:"UPDATE",schema:"public",table:"rooms",filter:"code=eq."+roomCode},payload=>{
      if (payload.new?.state) {
  roomState = payload.new.state;
  renderState();

  // Host checks whether both players have selected a number
  if (isHost && roomState.phase === "playing") {
    resolveIfReady();
  }
}
    }).subscribe(status=>{ $("connectionState").textContent=status==="SUBSCRIBED"?"LIVE":"Reconnecting…"; });
    clearInterval(poller);
    poller=setInterval(async()=>{try{const s=await fetchRoom(roomCode);if(s){roomState=s;renderState();}}catch(e){}},1800);
  }
  $("copyCodeBtn").onclick=async()=>{try{await navigator.clipboard.writeText(roomCode);$("copyCodeBtn").textContent="Copied!";setTimeout(()=>$("copyCodeBtn").textContent="Copy code",1400);}catch(e){$("copyCodeBtn").textContent=roomCode;}};
  $("createBtn").onclick=()=>ensureName(createRoom);
  $("joinBtn").onclick=()=>ensureName(joinRoom);
  $("joinCode").addEventListener("input",e=>e.target.value=e.target.value.replace(/\D/g,"").slice(0,6));
  $("startMatchBtn").onclick=async()=>{
    if(!roomState.guest)return;
    roomState.phase="toss";roomState.tossPick=null;roomState.tossWinner=null;
    // Toss is represented as a quick random toss, then host bats if host wins.
    roomState.tossWinner=Math.random()<.5?"host":"guest";
    roomState.battingId=roomState.tossWinner==="host"?roomState.host.id:roomState.guest.id;
    roomState.phase="playing";roomState.innings=1;roomState.inningsBatter={"1":roomState.battingId};roomState.scores={"1":0,"2":0};roomState.wickets={"1":0,"2":0};roomState.balls={"1":0,"2":0};roomState.target=null;roomState.picks={};roomState.lastPicks=null;roomState.roundNo=0;
    try{await saveState();renderState();}catch(e){msg("lobbyMessage","Couldn't start match: "+e.message);}
  };
  function renderState(){
    if(!roomState)return;
    if(roomState.phase==="lobby"){refreshLobby();return;}
    if(roomState.phase==="playing"){show("match");renderMatch();}
    if(roomState.phase==="finished"){renderResult();}
  }
  function currentInn(){return String(roomState.innings);}
  function currentScore(){return roomState.scores[currentInn()]||0;}
  function currentWickets(){return roomState.wickets[currentInn()]||0;}
  function currentBalls(){return roomState.balls[currentInn()]||0;}
  function maxBalls(){return roomState.oversLimit*6;}
  function oversText(b){return Math.floor(b/6)+"."+(b%6);}
  function renderMatch(){
    $("inningsLabel").textContent=roomState.innings===1?"1ST INNINGS":"2ND INNINGS";
    $("battingName").textContent=(myBatting()?"YOU":"OPPONENT")+" BATTING";
    $("runs").textContent=currentScore();$("wickets").textContent=currentWickets();$("overs").textContent=oversText(currentBalls())+" overs";
    $("target").textContent=roomState.target??"—";$("matchRoomCode").textContent=roomCode;
    const waiting=roomState.picks?.[playerId]!=null;
    const ended=roomState.phase!=="playing";
    $("turnPrompt").textContent=myBatting()?"Tap a number to play your shot":"Pick a number to bowl";
    document.querySelectorAll(".number-btn").forEach(b=>b.disabled=waiting||ended);
    $("matchStatus").textContent=waiting?"Number locked in — waiting for opponent":(myBatting()?"YOU ARE BATTING":"YOU ARE BOWLING");
    $("roundMessage").textContent=waiting?"Your pick is hidden until both players choose.":"Choose 1–6. Matching numbers mean OUT.";
    $("myPick").textContent=roomState.lastPicks?.[playerId]??"—";
    const opp=opponent();$("theirPick").textContent=roomState.lastPicks?.[opp?.id]??"—";
  }
  document.querySelectorAll(".number-btn").forEach(b=>b.onclick=()=>playNumber(Number(b.dataset.number)));
  async function playNumber(n){
    if(roomState.phase!=="playing"||roomState.picks[playerId]!=null)return;
    myNumber=n;roomState.picks[playerId]=n;
    try{await saveState();renderMatch();await resolveIfReady();}catch(e){$("roundMessage").textContent="Connection issue. Try again.";}
  }
  async function resolveIfReady(){
    const opp=opponent();if(!opp||roomState.picks[playerId]==null||roomState.picks[opp.id]==null)return;
    // Only the host resolves a ball to avoid two clients racing to update the score.
    if(!isHost)return;
    const batterId=roomState.battingId;
    const batPick=roomState.picks[batterId],bowlId=batterId===roomState.host.id?roomState.guest.id:roomState.host.id;
    const bowlPick=roomState.picks[bowlId];
    roomState.lastPicks={[batterId]:batPick,[bowlId]:bowlPick};
    const inn=currentInn();
    if(batPick===bowlPick)roomState.wickets[inn]++;
    else roomState.scores[inn]+=batPick;
    roomState.balls[inn]++;
    roomState.roundNo++;
    roomState.picks={};
    const inningsOver=roomState.wickets[inn]>=6||roomState.balls[inn]>=maxBalls();
    if(roomState.innings===1&&inningsOver){
      roomState.target=roomState.scores["1"]+1;roomState.innings=2;
      roomState.battingId=roomState.battingId===roomState.host.id?roomState.guest.id:roomState.host.id;
      roomState.inningsBatter["2"]=roomState.battingId;
    }else if(roomState.innings===2&&(inningsOver||roomState.scores["2"]>=roomState.target)){
      roomState.phase="finished";
      const a=roomState.scores["1"],b=roomState.scores["2"];
      roomState.winner=b>=roomState.target?(roomState.battingId):a>b?roomState.host.id:roomState.guest.id;
      if(a===b)roomState.winner="tie";
    }
    await saveState();renderState();
    if(roomState.phase==="playing")$("roundMessage").textContent=batPick===bowlPick?"WICKET! Same number.":"+"+batPick+" RUNS!";
  }
  function renderResult(){
    show("result");
    const mine=["1","2"].reduce((sum,inn)=>sum+(roomState.inningsBatter?.[inn]===playerId?(roomState.scores[inn]||0):0),0);
    const theirs=["1","2"].reduce((sum,inn)=>sum+(roomState.inningsBatter?.[inn]!==playerId?(roomState.scores[inn]||0):0),0);
    const won=roomState.winner===playerId;
    $("resultTitle").textContent=roomState.winner==="tie"?"It's a tie!":won?"You won!":"You lost";
    $("resultSubtitle").textContent=roomState.winner==="tie"?"Both players finished level.":won?"Well played — great innings!":"Good game. Fancy another match?";
    $("yourFinalScore").textContent=mine;$("opponentFinalScore").textContent=theirs;
  }
  $("rematchBtn").onclick=()=>{cleanup();roomCode=null;roomState=null;show("home");sayHome("Create a new room to play again.");};
  function cleanup(){clearInterval(poller);poller=null;if(channel&&db){db.removeChannel(channel);channel=null;}}
  window.addEventListener("beforeunload",cleanup);
  if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
  if(!db){$("connectionState").textContent="SETUP REQUIRED";}
})();