import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

import { ApiModule, BASE_PATH, Configuration } from './backend';

import {ButtonModule} from 'primeng/button';
import { LoginScreenComponent } from './login-screen/login-screen.component';
import { DashboardComponent } from './dashboard/dashboard.component';

export function cfgFactory() {
    return new Configuration();
}

@NgModule({
    declarations: [
        AppComponent,
        LoginScreenComponent,
        DashboardComponent
    ],
    imports: [
        BrowserModule,
        BrowserAnimationsModule,
        HttpClientModule,
        AppRoutingModule,

        ApiModule.forRoot(cfgFactory),

        ButtonModule,
    ],
    providers: [{ provide: BASE_PATH, useValue: 'http://localhost:8080/api' }],
    bootstrap: [AppComponent]
})
export class AppModule { }
