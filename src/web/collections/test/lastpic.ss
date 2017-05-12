(require test/turtle)

(define KUVIO (list (set-origin)
                    (set-bg-grid 30 30 "green")
                    (change-color "black")
                    (go-to 90 60)))

(draw KUVIO)
