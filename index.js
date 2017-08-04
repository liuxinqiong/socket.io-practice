/**
 * Created by sky on 2017/7/25.
 */
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var posServer=require('./server/posServer');
var chatServer=require('./server/chatServer');
var ebusServer=require('./server/ebusServer');
posServer(io);
chatServer(io);
ebusServer(io);

app.get('/chat', function(req, res){
    res.sendFile(__dirname + '/view/index.html');
});

app.get('/ebus',function(eq, res){
    res.sendFile(__dirname + '/view/ebus.html');
});

app.get('/pos',function(eq, res){
    res.sendFile(__dirname + '/view/pos.html');
})

http.listen(8898, function(){
    console.log('listening on *:8898');
});

