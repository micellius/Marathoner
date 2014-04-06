var os = require('os'),
    host = process.env.host || 'http://localhost:3000';
    socket = require('socket.io-client').connect(host);

function runTask(data) {
    // TODO: Run the task
}

socket.on('connect', function(){
    var interval,
        status;

    console.log('Agent is connected to controller.');

    status = 'idle';
    totalUsers = 0;
    runningUsers = 0;

    socket.emit('info', {
        type: 'agent',
        status: status,
        totalUsers: totalUsers,
        runningUsers: runningUsers,
        name: 'Agent ' + (new Date()).getTime(),
        cpus: os.cpus(),
        totalmem: os.totalmem(),
        freemem: os.freemem(),
        platform: os.platform()
    });

    socket.on('task', function(data){
        var i;

        console.log('Task received: ', data);
        status = 'rump';
        totalUsers = data.users;

        for(i=0; i<totalUsers; i++) {
            (function(i) {
                setTimeout(function() {
                    runTask(data.data);
                    runningUsers++;
                    if(runningUsers === totalUsers) {
                        status = 'run';
                    }
                }, data.rump * 1000 * i);
            }(i));
        }
    });

    socket.on('disconnect', function(){
        console.error('Agent is disconnected from controller!');
        clearInterval(interval);
    });

    interval = setInterval(function() {
        socket.emit('status', {
            status: status,
            totalUsers: totalUsers,
            runningUsers: runningUsers,
            cpus: os.cpus(),
            totalmem: os.totalmem(),
            freemem: os.freemem()
        })
    }, 1000);
});