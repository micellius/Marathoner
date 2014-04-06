
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var http = require('http');
var io = require('socket.io');
var path = require('path');
var extend = require('util')._extend;
var fs = require('fs');

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.favicon('public/images/favicon.png'));
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'bower_components')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

// Routes

app.get('/', routes.index);

// HTTP Server

var server = http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

// ============================================================================

// Sockets

var clients = {};
var tasks = [];
var testsPath = './tests';

fs.readdir(testsPath, function(err, files) {
    var i;

    if(!err) {
        for(i=0; i<files.length; i++) {
            (function(file) {
                fs.readFile(testsPath + '/' + file, 'utf8', function(err, data) {
                    var arr, re = /@transactionStart\s*([^\s]*)\s/mg;
                    tasks.push({
                        name: file,
                        data: data
                    });
                    while(arr = re.exec(data)) {
                        tasks.push({
                            name: '- ' + arr[1],
                            data: data
                        });
                    }
                });

            }(files[i]));
        }
    }
});

function broadcast(opts) {
    var id,
        client,
        idx;

    opts = extend({
        clientType: '',
        eventName: '',
        eventData: {},
        filter: function() { return true },
        delay: 0
    }, opts);

    idx = 0;
    for(id in clients) {
        if(clients.hasOwnProperty(id)) {
            client = clients[id];
            if(client.data.type === opts.clientType && opts.filter(client)) {
                if(opts.delay > 0) {
                    (function (client, opts, idx) {
                        setTimeout(function() {
                            client.emit(opts.eventName, opts.eventData);
                        }, opts.delay * idx * 1000);
                    }(client, opts, idx++));
                } else {
                    client.emit(opts.eventName, opts.eventData);
                }
            }
        }
    }
}

function agentAdded(agent) {
    broadcast({
        clientType: 'viewer',
        eventName: 'agentAdded',
        eventData: agent.data
    });
}

function agentRemoved(agent) {
    broadcast({
        clientType: 'viewer',
        eventName: 'agentRemoved',
        eventData: agent.data.id
    });
}

function getClientsByType(type) {
    var id,
        client,
        list;

    list = [];
    for(id in clients) {
        if(clients.hasOwnProperty(id)) {
            client = clients[id];
            if(client.data.type === type) {
                list.push(client.data);
            }
        }
    }

    return list;
}

function initViewer(viewer) {
    viewer.emit('init', {
        agents: getClientsByType('agent'),
        tasks: tasks
    });
}

function updateViewers(data) {
    broadcast({
        clientType: 'viewer',
        eventName: 'agentStatus',
        eventData: data
    });
}

function start(data) {
    var agents = getClientsByType('agent'),
        agentsCount = agents.length,
        usersCount = parseInt(data.users,10),
        usersPerAgent = Math.floor(usersCount / agentsCount),
        usersLeftover = usersCount - (usersPerAgent * agentsCount),
        task = extend({}, data),
        delay = parseFloat(data.rump) * agentsCount,
        opts;

    task.users = usersPerAgent;
    task.rump = delay;

    opts = {
        clientType: 'agent',
        eventName: 'task',
        eventData: task,
        filter: function(client) {
            return client.id !== agents[agentsCount-1].id;
        },
        delay: delay
    };

    broadcast(opts);

    setTimeout(function() {
        task.users = usersPerAgent + usersLeftover;
        opts.filter = function (client) {
            return client.id === agents[agentsCount - 1].id;
        };
        broadcast(opts);
    }, delay * agentsCount * 1000);
}

io = io.listen(server);
io.sockets.on('connection', function (socket) {

    // Info
    socket.on('info', function(data) {
        clients[this.id] = this;
        data.id = this.id;
        this.data = data;
        console.log(data.type + ' ' + this.id + ' connected');
        switch(data.type) {
            case 'agent':
                agentAdded(this);
                break;
            case 'viewer':
                initViewer(this);
                break;
        }
    }.bind(socket));

    // Status
    socket.on('status', function(data) {
        var key;
        console.log('Status: ', data);
        for(key in data) {
            if(data.hasOwnProperty(key)) {
                this.data[key] = data[key];
            }
        }
        updateViewers(this.data);
    }.bind(socket));

    // Start
    socket.on('start', function(data) {
        console.log('Start: ', data);
        start(data);
    }.bind(socket));

    // Disconnect
    socket.on('disconnect', function () {
        var data;
        console.log(this.data.type + ' ' + this.id + ' disconnected');
        data = clients[this.id].data;
        delete clients[this.id];
        switch(data.type) {
            case 'agent':
                agentRemoved(this);
                break;
        }
    }.bind(socket));

});
