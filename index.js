const {makeMaze, makeRandomMaze, makeMove} = require('@y0urstruly/maze');
const http=require('node:http'), fs=require('node:fs'), crypto=require('node:crypto');
const WebSocket=require('ws'), slash=process.platform=="win32"?"\\":"/";
const random=_=> crypto.webcrypto.getRandomValues(new Uint32Array(1))[0];
const range=(min,max)=>(random()%((max+1)-min))+min;

let ab_map=[], str_map={__proto__:null}, NULL=Symbol(null)
for(let i=0;i<256;i++){
  ab_map[i]=String.fromCharCode(i);
  str_map[ab_map[i]]=i;
}
function ab2str(buf) {
  let arr=new Uint8Array(buf), chars="";
  for(let i=0;i<arr.length;i++) chars+=ab_map[arr[i]];
  return chars;
}
function validName(str){
    if(str.length>16) return false;
    let space=false;
    for(let i=0;i<str.length;i++){
        if(str[i]===' '){
            if(space) return false; //not 2 spacebars in a row
            space=true;
            continue;
        }
        else space=false; //reset when new character isn't spacebar
        let n=str_map[str[i]]
        if(!((n>=48&&n<=57) || (n>=65&&n<=90) || (n>=97&&n<=122))) return false;
    }
    return str.length>0 && str[0]!==' ' && str.at(-1)!==' ';
}
const html=ab2str(
    fs.readFileSync(__dirname+slash+'client.html')
).split("\\\\")

const players={__proto__:null};
let game=makeRandomMaze(20,20,20,0.8,0.4);
game.dataURL=game.canvas.toDataURL();
function createToken(){
    do{
        var token="" //starts off
        for(let i=0;i<15;i++){
            let ch=ab_map[range(32,126)];
            while(ch==='"' || ch==='\\') ch=ab_map[range(32,126)];
            token+=ch;
        }
    }while(players[token]);
    let timeout=setTimeout(_=>delete players[token],5e3);
    let hex=crypto.createHash('sha256').update(token).digest('hex').substring(0,6);
    players[token]={socket:null,pos:null,name:null,hex,timeout,interval:null,__proto__:null};
    return token;
}
let newMazeLoading=false, newMazeStartDate=Date.now(), newMazeWinners=null, winnerDisplay="", livePlayerCount=0;
async function newMaze(){ //maze updated
    newMazeLoading=true;
    newMazeWinners||=[];
    //now to show winners start
    let L=newMazeWinners.length;
    winnerDisplay=`<h1>${L>1?"The Winners are:":L>0?"The Winner is:":"Nobody Won ;-;"}</h1><br>`
    winnerDisplay+="<ol>"+newMazeWinners.map(([token,time],i)=>
        i>=5?"":`<li>
            <pre class="left"><b>Name: </b>${players[token].name||'<span style="color:red">&lt;UNNAMED&gt;</span>'}</pre>
            <pre class="right"><b>Time: </b>${(time/1000).toFixed(3)} s</pre>
        </li>`
    ).join('\n')+"</ol>";
    let keys=Object.keys(players);
    for(let i=0;i<keys.length;i++)
        if(players[keys[i]].socket!==null) players[keys[i]].socket.send('#'+winnerDisplay);
    await new Promise(next=>setTimeout(next,5e3)); //screen shown for 5 seconds
    //now to show winners stop
    newMazeWinners=null;
    newMazeLoading=false;
    game=makeRandomMaze(20,20,20,0.8,0.4); //low of 0.4 instead of 0.2 for mazes with smaller paths
    newMazeStartDate=Date.now();
    game.dataURL=game.canvas.toDataURL();
    keys=Object.keys(players);
    for(let i=0;i<keys.length;i++){
        players[keys[i]].pos=Array.from(game.start);
        if(players[keys[i]].socket!==null) players[keys[i]].socket.send('='+game.dataURL);
    }
}
setInterval(_=>{ //player state updated
    let keys=Object.keys(players), KEYS=[], text='_';
    for(let i=0;i<keys.length;i++){
        if(players[keys[i]].socket!==null){
            KEYS[KEYS.length]=keys[i];
            let [x,y]=players[keys[i]].pos;
            text+=newPos(x,y,players[keys[i]].hex,game.DRAW,false);
        }
    }
    for(let i=0;i<KEYS.length;i++){
        let [x,y]=players[KEYS[i]].pos;
        players[KEYS[i]].socket.send(text+newPos(x,y,players[KEYS[i]].hex,game.DRAW,true));
    }
},50)
function short(num){
    let rem=num%256;
    return ab2str([(num-rem)/256,rem])
}
function newPos(x,y,colour,{l,f,s},isPlyr){
    let posX=(x*(l+s))+f,  posY=(y*(l+s))+f;
    let X=posX+s/2+f, Y=posY+s/2+f, S=(s/2)-f;
    return short(X)+short(Y)+short(S)+colour+(isPlyr?short(S+f)+'\n':'\n');
}

const server=http.createServer(function(req,res){
    //return res.end("<pre>Game Updating<br>Please hold on...</pre>"); //used for when updating
    res.setHeader('Content-Type','text/html');
    res.end(html.join(createToken()))
}).listen(8080,_=>console.log('hosting...'))
const ws = new WebSocket.Server({server,maxPayload:2**11})
ws.on('connection',client=>{
    let lastPing=Number(new Date()), token=NULL, nameChanges=0;
    let afk=setTimeout(_=>client.close(1000),2e3);
    let ping=setInterval(_=>{
        if(new Date()-lastPing>7e3){
            if(token!==NULL){
                livePlayerCount--; //a player has left the game
                players[token].timeout=setTimeout(_=>delete players[token],2e4);
            }
            client.close(1000);
            clearInterval(ping);
        }
    },1e3)
    client.on('message',msg=>{
        if(msg.length<1024) msg=ab2str(msg);
        else return 0; //as for now, ignore... will be a feature later
        if(token===NULL){ //on first msg
            if(msg.length!==15)
                return client.close("invalid authentication"); //because every token is of length 15
            if(!players[msg])
                return client.close(1000,"token is not reserved");
            if(players[msg].socket!==null)
                return client.close(1000,"token is currently in use");
            if(livePlayerCount<1) newMazeStartDate=Date.now();
            clearTimeout(afk); //first message sent, not afk
            lastPing=Number(new Date());
            players[msg].pos=players[msg].pos||Array.from(game.start); //set player starting pos
            client.send("PING"); //start the pinging
            players[msg].socket=client; //save socket
            clearTimeout(players[msg].timeout); //seal the reservation
            clearInterval(players[msg].interval); //remove old ping interval (for reconnections)
            players[msg].interval=ping; //setting new ping interval
            client.send('='+game.dataURL) //the maze itself
            livePlayerCount++; //new live player
            return token=msg; //save the token
        }
        if(msg==="PING"){ //on ping
            if(Date.now()-lastPing<2e3) return client.close(1000); //pinging too fast ;-;
            lastPing=Number(new Date())
            return client.send("PING")
        }
        if(msg[0]==='-'){ //set name
            let name=msg.substr(1);
            if(!validName(name)) return 0;
            if(++nameChanges>2) return 0;
            return players[token].name=name;
        }
        if(msg[0]==='|'){ //on chat message
            if(msg.length<2) return 0; //ignore blank message
            let the_message=JSON.stringify({
                message:msg.substr(1),sender:players[token].name||"<UNNAMED>",hex:players[token].hex
            })
            let keys=Object.keys(players);
            for(let i=0;i<keys.length;i++)
                if(players[keys[i]].socket!==null) players[keys[i]].socket.send('|'+the_message);
            return 1;
        } 
        if(newMazeLoading) return 0; //maze round finished, no more movements
        //else analyse game movements below once the player isn't at the end
        if(game.end[0]!==players[token].pos[0] || game.end[1]!==players[token].pos[1]){
            makeMove(game,msg,players[token].pos);
            if(game.end[0]===players[token].pos[0] && game.end[1]===players[token].pos[1]){
                if(!newMazeWinners){
                    setTimeout(newMaze,5e3);
                    newMazeWinners=[]
                }
                newMazeWinners.push([token,Date.now()-newMazeStartDate])
            }
        }
    })
    let inactive=_=>token!==NULL&&players[token]? players[token].socket=null: client.terminate();
    client.on('close',inactive)
    client.on('error',inactive)
    client.on('disconnect',inactive)
})