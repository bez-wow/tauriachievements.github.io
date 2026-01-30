import { Component } from '@angular/core';
import { AchievementLadderComponent } from './ladder.component';

@Component({
    selector: 'app-root',
    template: '<app-achievement-ladder></app-achievement-ladder>',
    imports: [AchievementLadderComponent],
    standalone: true
})
export class AppComponent {
}
