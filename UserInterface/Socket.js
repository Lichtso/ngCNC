export class Socket {
    constructor() {
        fetch('/socket', {'method': 'GET'}).then((response) => {
            console.log(response.body);
            const reader = response.body.getReader();
            const receive = ({done, value}) => {
                if(done) {
                    if(this.onclose)
                        this.onclose();
                    return;
                }
                if(!this.name)
                    new Response(value).text().then(data => {
                        this.name = data;
                        console.log(data);
                        if(this.onopen)
                            this.onopen();
                    });
                else if(this.ondata)
                    new Response(value).json().then(data => this.ondata(data));
                return reader.read().then(receive);
            };
            reader.read().then(receive);
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
