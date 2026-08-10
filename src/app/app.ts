import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Application root.
 *
 * Deliberately empty apart from the outlet: page structure belongs to the shells in
 * `shells/`, which the route tree selects per branch. Putting a header here would
 * force it onto both the public and secure branches.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}
