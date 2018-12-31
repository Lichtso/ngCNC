export class Socket {
    constructor() {
        const source = new EventSource('/socket');
        source.addEventListener('uplink', (event) => {
            this.name = event.data;
            this.onopen();
        });
        source.addEventListener('error', (event) => {
            source.close();
            this.onclose();
        });
        source.addEventListener('message', (event) => {
            this.ondata(JSON.parse(event.data));
        });
    }

    send(data) {
        fetch(this.name, {'method': 'POST', 'body': JSON.stringify(data)});
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
