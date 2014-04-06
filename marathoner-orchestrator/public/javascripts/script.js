angular.module('marathoner', []).
    directive('loadGraph', [function() {
        return {
            scope: {
                graph: '=loadGraph'
            },
            link: function(scope, element) {

                var n = 180,
                    duration = 500,
                    now = new Date(Date.now() - duration),
                    data = d3.range(n).map(function() { return 0; }),
                    cpuData = d3.range(n).map(function() { return 0; });

                var margin = {top: 6, right: 10, bottom: 20, left: 40},
                    width = 1078 - margin.left - margin.right,
                    height = 250 - margin.top - margin.bottom;

                var x = d3.time.scale()
                    .domain([now - (n - 2) * duration, now - duration])
                    .range([0, width]);

                var y = d3.scale.linear()
                    .domain([0, 1])
                    .range([height, 0]);

                var line = d3.svg.line()
                    .interpolate("basis")
                    .x(function(d, i) { return x(now - (n - 1 - i) * duration); })
                    .y(function(d, i) { return y(d); });

                var svg = d3.select(element[0]).append("svg")
                    .attr("width", width + margin.left + margin.right)
                    .attr("height", height + margin.top + margin.bottom)
                    .append("g")
                    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

                svg.append("defs").append("clipPath")
                    .attr("id", "clip")
                    .append("rect")
                    .attr("width", width)
                    .attr("height", height);

                var axis = svg.append("g")
                    .attr("class", "x axis")
                    .attr("transform", "translate(0," + height + ")")
                    .call(x.axis = d3.svg.axis().scale(x).orient("bottom"));

                svg.append("g")
                    .attr("class", "y axis")
                    .call(d3.svg.axis().scale(y).orient("left").tickFormat(function(d) {
                        return d*100 + '%';
                    }));

                var usersPath = svg.append("g")
                    .attr("clip-path", "url(#clip)")
                    .append("path")
                    .data([data])
                    .attr("class", "line users");

                var cpuPath = svg.append("g")
                    .attr("clip-path", "url(#clip)")
                    .append("path")
                    .data([cpuData])
                    .attr("class", "line cpu");

                tick();

                function tick() {

                    // update the domains
                    now = new Date();
                    x.domain([now - (n - 2) * duration, now - duration]);

                    // users
                    data.push(scope.graph.users);

                    // cpu
                    cpuData.push(scope.graph.cpu);

                    // redraw the line
                    svg.selectAll(".line")
                        .attr("d", line)
                        .attr("transform", null);

                    // slide the x-axis left
                    axis.transition()
                        .duration(duration)
                        .ease("linear")
                        .call(x.axis);

                    // slide the users line left
                    usersPath.transition()
                        .duration(duration)
                        .ease("linear")
                        .attr("transform", "translate(" + x(now - (n - 1) * duration) + ")");

                    // slide the cpu line left
                    cpuPath.transition()
                        .duration(duration)
                        .ease("linear")
                        .attr("transform", "translate(" + x(now - (n - 1) * duration) + ")")
                        .each("end", tick);

                    // pop the old users data point off the front
                    data.shift();

                    // pop the old cpu data point off the front
                    cpuData.shift();
                }

            }
        }
    }]).
    factory('socket', [function() {
        return io.connect(location.origin);
    }]).
    controller('dashboardController', ['$scope', '$log', 'socket', function($scope, $log, socket) {
        var cpuAnomaly = 0;

        // Base CPU ticks
        setInterval(function() {
            updateCpu();
        }, 1000);

        function updateCpu(delta) {
            $scope.graph.cpu = Math.min(1, // CPU can't be >100%
                $scope.graph.runningUsers * 0.0025 + // Each user adds 0.25% CPU
                ($scope.graph.runningUsers < 32 ? 0 : ($scope.graph.runningUsers-32) * 0.0025) + // Each user after 32 adds additional 0.25% CPU
                Math.random() / 20 +       // Noise 5%
                (delta || 0) +             // Explicit delta
                ($scope.graph.runningUsers > 0 ? cpuAnomaly : (cpuAnomaly = 0)) // CPU Anomaly (~30s after rump is over)
            );
        }

        function updateGraph() {
            var i,
                agent,
                totalUsers = 0,
                runningUsers = 0,
                oldRunningUsers;

            for(i=0; i<$scope.agents.length; i++) {
                agent = $scope.agents[i];
                totalUsers += agent.totalUsers;
                runningUsers += agent.runningUsers;
            }

            oldRunningUsers = $scope.graph.users;
            $scope.graph.users = totalUsers ? runningUsers / totalUsers : 0;
            $scope.graph.runningUsers = runningUsers;

            if(oldRunningUsers < $scope.graph.users) {
                setTimeout(function(){
                    updateCpu(0.05); // Add 5% CPU when new user enters
                }, 500);
            }
        }

        $scope.graph = {
            users: 0,
            runningUsers: 0,
            cpu: 0
        };

        $scope.start = function() {
            var task = {
                name: $scope.task.name,
                users: $scope.users,
                rump: $scope.rump,
                count: $scope.count
            };
            $log.debug('Start: ', task);
            socket.emit('start', task);

            setTimeout(function() {
                var interval = setInterval(function() {
                    cpuAnomaly = Math.random() * 0.1 + 0.25; // 20s after rump is over start adding ~30% CPU
                }, 500);
            }, (Math.round(parseInt(task.users,10) * parseFloat(task.rump)) + 30) * 1000);
        };

        $scope.getAgentStatusClass = function(agent) {
            var status = 'default';
            switch(agent.status) {
                case 'rump':
                    status = 'warning';
                    break;
                case 'run':
                    status = 'primary';
                    break;
                case 'overload':
                    status = 'danger';
                    break;
                case 'idle':
                default:
                    status = 'default';
                    break;
            }
            return 'label pull-right label-' + status;
        };

        socket.on('connect', function() {
            $log.debug('Viewer is connected to controller');

            // Info
            socket.emit('info', {
                type: 'viewer',
                name: 'Viewer ' + (new Date()).getTime()
            });

            // Init
            socket.on('init', function(data) {
                $log.debug('Init: ', data);
                $scope.$apply(function() {
                    $scope.agents = data.agents;
                    $scope.tasks = data.tasks;
                });
            });

            // Agent added
            socket.on('agentAdded', function(data) {
                $log.debug('Agent added: ', data);
                $scope.$apply(function() {
                    $scope.agents.push(data);
                })
            });

            // Agent added
            socket.on('agentStatus', function(data) {
                $log.debug('Agent status: ', data);
                $scope.$apply(function() {
                    var i,
                        id = data.id,
                        agent;

                    for(i=0; i<$scope.agents.length; i++) {
                        agent = $scope.agents[i];
                        if(agent.id === id) {
                            angular.extend(agent, data);
                        }
                    }

                    updateGraph();
                })
            });

            // Agent removed
            socket.on('agentRemoved', function(data) {
                var i,
                    id; // agent ID

                $log.debug('Agent removed: ', data);

                for(i=0; i<$scope.agents.length; i++) {
                    id = $scope.agents[i].id;
                    if(id === data) {
                        $scope.$apply(function() {
                            // Remove disconnected agent
                            $scope.agents.splice(i, 1);
                        })
                    }
                }

                updateGraph();
            });

        });

    }]);