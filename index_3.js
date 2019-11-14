/*****************************************************************
 * SCOREDERBOT:
 * A SLACKBOT THAT DEALS PRIMARILY WITH VORDERBOT
 * **************************************************************/

//Set up RTM api, proxy, and file system reader
const { RTMClient, CLIENT_EVENTS, RTM_EVENTS } = require('@slack/rtm-api');
const token = process.env.VORDERTOKEN; //ScoreToken is an environment variable set with the token in (so it's not published to github)
//const HttpsProxyAgent = require('https-proxy-agent');
//const proxyUrl = process.env.http_proxy //likewise for the proxy
var fs = require("fs");
const rtm = new RTMClient(token); //creates a new RTM bot
scoreboards = [];
theUserList = [];
listAccessCount = 0;
//class definitions

class Score{ //Object to represent score for a single user
    constructor(user,score, averagescore, numgames){
        this.user = user;
        this.score = score;
        this.numOfGames = numgames;
        this.averageScore = averagescore;
    }
    addscore(toadd){ //adding to score and recalculating average
        this.score += toadd;
        this.numOfGames++;
        this.averageScore = parseFloat((this.score) / this.numOfGames).toFixed(2);
    }
    resetscore(){ //does what it says on the tin
        this.score = 0;
    }
}

class Scoreboard{ //object to represent all scores on a channel
    constructor(event, scores){
        this.ev = event;
        this.channel = event.channel;
        this.scores = scores;
    }
    addUser(event,score){ //adds a new user to the scoreboard
        var avgSc = score;
        var nog = 1;
        this.scores.push(new Score(event.user, score, avgSc, nog));
    }
    refreshLeaderboard(){ //sorts the scoreboard into score order (scorder)
       this.scores.sort(function(a,b){return b["score"]-a["score"];})
    }
    printScores(event){ //prints a scoreboard to chat
        rtm.sendMessage("CHANNEL COUNTDOWN SCOREBOARD:",event.channel);
        var StringToSend = "";
        for(var z = 0; z < (this.scores.length < 10 ? this.scores.length : 10); z++){ //if there are more than 10 people in this scoreboard limit to 10
            var UserDisName = GetUserNameFromList(this.scores[z].user);
            StringToSend = StringToSend.concat(z+1,". ", UserDisName,": ",this.scores[z].score," points. ") + "Average score of " + this.scores[z].averageScore + " over " + this.scores[z].numOfGames + " games. \n"; //build a string with the scoreboard in
        }
        rtm.sendMessage(StringToSend,event.channel); //send message to chat
    }

    queryScore(event){ //if one user asks their own acore
        var PosInSb = this.getUserPos(event.user);
        if (PosInSb == -1) {rtm.sendMessage("<@".concat(event.user,">, I don't have you down as having any points."),event.channel);}
        else{
        rtm.sendMessage("<@".concat(event.user, ">, you have ",this.scores[PosInSb].score," points, averaging a score of ", this.scores[PosInSb].averageScore, " over ",this.scores[PosInSb].numOfGames, " games. You are number ", PosInSb+1, " on this channel's leaderboard."),event.channel);
        }
    }

    getUserPos(user){ //get a user's position in the leaderboard and return their (zero indexed) position in the array. -1 if they aren't there.
        for(var k = 0; k < this.scores.length; k++){
            if(this.scores[k].user == user){
                return k;
            }
        }
        return -1;
    }
}



//Setup functions to run
(async () => { //lmao I have no idea what this bit does I just copied it from the API
          // Connect to Slack
    const { self, team  } = await rtm.start();
})();


loadScoreboards(); //should run on startup
GetUserList();


function GetUserList(){ //gets the full list of all users on the workspace. Only way to get display names and not mention every user on the leaderboard.
    if(listAccessCount % 5 == 0){ //only do this once in every 5 accesses because of rate limiting
    listAccessCount = 1;
    theUserListPromise = rtm.webClient.users.list(); //returns a promise (idk either) with the array in
    theUserListPromise.then(function(getar){ //extract array from that promise
        theUserList = getar.members;
    })
    }
}

function GetUserNameFromList(InID){ //returns the user name from the users list when supplied with UID. -1 if not.
    for(var q = 0; q < theUserList.length; q++){
        if(InID == theUserList[q].id) return theUserList[q].profile.display_name;
    }
    return -1;
}

//Vorderbot tracking

function getScoreboardChannelpos(event){ //Returns the scoreboard position for this channel
    for(m=0;m<scoreboards.length;m++){
        if(event.channel == scoreboards[m].channel){
            return m;
        }

    }
        return -1;
}

function handleVorderbot(event){ //Watches Vorderbot messages
    if(event.text.toLowerCase().indexOf("points") != -1 && event.text.toLowerCase().indexOf("longest") == -1){ //if message contains the word "points"
        TheUser = event.text.slice(2,11); //get user ID
        ThePoints = parseInt(event.text.slice(18,20)); //get score and parse to int
        if(getScoreboardChannelpos(event)==-1){ //if this is the first game in the channel
            scoreboards.push(new Scoreboard(event,[]));
        }
        theLoc = getScoreboardChannelpos(event);
        theUserPos = scoreboards[theLoc].getUserPos(TheUser);
        if(theUserPos == -1){ //if this is the first time a user wins points
            scoreboards[theLoc].scores.push(new Score(TheUser,ThePoints, ThePoints, 1))
            scoreboards[theLoc].refreshLeaderboard();
            saveScoreboards();
            return; //return ie don't do the rest

        }
        scoreboards[theLoc].scores[theUserPos].addscore(ThePoints);
        scoreboards[theLoc].refreshLeaderboard(); //refresh the leaderboard
        saveScoreboards(); //save to file
    }
}

function scoresHandler(MsgArgs,event){ //handles chat commands
    TheBoard = getScoreboardChannelpos(event);
    if(MsgArgs.length == 1){
        if(TheBoard == -1){
            rtm.sendMessage("I don't have any scores stored for this channel.",event.channel);
        }
        else{
            scoreboards[TheBoard].printScores(event);
        }
    }
    else if(MsgArgs[1] == "me"){ //if a user asks
        if(TheBoard == -1){
            rtm.sendMessage("I don't have any scores stored for this channel.",event.channel);
        }
        else{
        theUserPos = scoreboards[TheBoard].getUserPos(event.user);
            if(theUserPos == -1){
                rtm.sendMessage("I don't have a score stored for <@".concat(event.user,">."),event.channel);
            }
            else{
                scoreboards[TheBoard].refreshLeaderboard();
                scoreboards[TheBoard].queryScore(event);
            }
        }
    }
}

function saveScoreboards(){ //writes the scoreboards to a massive jason
    fileWrite = JSON.stringify(scoreboards);
    fs.writeFile("scoreboards",fileWrite, (err) => {
                if (err) console.log(err);

    });
}

function loadScoreboards(){ //load the scoreboards from the file
    if(fs.existsSync("scoreboards")){ //check if the file exists and if it doesn't don't try to load
    fs.readFile("scoreboards", function(err,buf){
        bur = JSON.parse(buf.toString()); //parse the json but now it's all strings
        for(i=0;i<bur.length;i++){
            TheScoresArr = [];
            for (k=0;k<bur[i].scores.length;k++){
                TheScoresArr.push(new Score(bur[i].scores[k].user,parseInt(bur[i].scores[k].score), Number(bur[i].scores[k].averageScore),parseInt(bur[i].scores[k].numOfGames))); //reconstruct scoreboard
            }
            scoreboards.push(new Scoreboard(bur[i].ev, TheScoresArr)); //reconstruct scoreboards array
        }
    });

}
else{
    return;
}

}

//Chat handling functions

rtm.on('message', (event) => { //this is a callback that occurs on every message sent to every channel the bot is in
    if(event.hidden == true){
        return;
    } //don't do stuff on 'hidden' messages such as edits
    const BotID = "@".concat(rtm.activeUserId); //grab the bot ID in @chipsbot form
    if(event.type == 'message'){
        if(event.user == "W8RU4FJ95"){
            handleVorderbot(event);
        }
    }
        MsgArgs = parseMessage(event.text); //get the message args as an array
        if(MsgArgs[0] == "<".concat(BotID.toLowerCase(),">")){  //if first arg of message is @scorederbot then start doing stuff
                scoresHandler(MsgArgs,event);
            }

    return;
});


function parseMessage(inputString){ //return each word in a message as an entry in an array
    inputString = inputString.toLowerCase(); //make case insensitive
    var ArrayPos = 0;
    var retArray = [];
    var SpacePos = 0;
    while(inputString.indexOf(" ") != -1){ //iterate around message finding first space and putting word into array
        SpacePos = inputString.indexOf(" ");
        retArray[ArrayPos++]=inputString.slice(0, SpacePos)
        inputString = inputString.slice(SpacePos+1, inputString.length);
    }
    retArray[ArrayPos]=inputString //put remainder of message into last entry of array
    return retArray;
}


