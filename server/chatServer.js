/**
 * Created by sky on 2017/8/3.
 */

 module.exports=function (io) {
     io.of('/chat').on('connection', function(socket){
         console.log('a user chat connected');
         socket.on('disconnect', function(){
             console.log('user disconnected');
         });
         socket.on('chat message', function(msg){
             console.log('message: ' + msg);
             io.of('/chat').emit('chat message', msg);
         });
         socket.broadcast.emit('new','hi');
         io.of('/chat').emit('some event', { for: 'everyone' });
     });
 }