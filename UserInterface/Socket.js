class Socket {
    constructor() {
        const socket = this;
        fetch('/', {'method': 'DOWN'}).then(function(response) {
            const reader = response.body.getReader();
            reader.read().then(function receive({done, value}) {
                if(done) {
                    if(socket.onclose)
                        socket.onclose();
                    return;
                }
                if(!socket.name)
                    new Response(value).text().then(data => {
                        socket.name = data;
                        if(socket.onopen)
                            socket.onopen();
                    });
                else if(socket.ondata)
                    new Response(value).json().then(data => socket.ondata(data));
                return reader.read().then(receive);
            });
        });
    }

    send(data) {
        fetch(this.name, {'method': 'UP', 'body': JSON.stringify(data)});
    }

    onopen() {
        console.log('onopen');
    }

    onclose() {
        console.log('onclose');
    }

    ondata(data) {
        console.log(data);
    }
};
